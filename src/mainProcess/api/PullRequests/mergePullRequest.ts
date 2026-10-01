import Logger from "electron-log";
import { getGithubClient } from "../githubClient";
import { getCachedData } from "./utils/getDefaultData";
import { MERGE_METHODS } from "./mergePullRequest.types";
import type {
  MergeMethod,
  MergeOptions,
  MergePullRequestInput,
  MergeResult,
  MergeStatusInput,
  MergeStatusResult,
  PullRequestIdentity,
  PullRequestStackIdentity,
} from "./mergePullRequest.types";

export type {
  MergeMethod,
  MergeOptions,
  MergePullRequestInput,
  MergeResult,
  MergeStatusInput,
  MergeStatusResult,
  PullRequestIdentity,
  PullRequestStackIdentity,
} from "./mergePullRequest.types";

const GITHUB_API_HEADERS = { "X-GitHub-Api-Version": "2026-03-10" };

const isMergeMethod = (value: unknown): value is MergeMethod =>
  typeof value === "string" && MERGE_METHODS.includes(value as MergeMethod);

export const isPullRequestIdentity = (
  value: unknown,
): value is PullRequestIdentity => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const { owner, repository, pullNumber } = value as Record<string, unknown>;
  return (
    typeof owner === "string" &&
    owner.length > 0 &&
    typeof repository === "string" &&
    repository.length > 0 &&
    typeof pullNumber === "number" &&
    Number.isInteger(pullNumber) &&
    pullNumber > 0
  );
};

const isPullRequestStackIdentity = (
  value: unknown,
): value is PullRequestStackIdentity => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const { number, position, baseRef } = value as Record<string, unknown>;
  return (
    typeof number === "number" &&
    Number.isInteger(number) &&
    number > 0 &&
    typeof position === "number" &&
    Number.isInteger(position) &&
    position > 0 &&
    typeof baseRef === "string" &&
    baseRef.length > 0
  );
};

export const isMergePullRequestInput = (
  value: unknown,
): value is MergePullRequestInput => {
  if (!isPullRequestIdentity(value)) return false;

  const raw = value as unknown as Record<string, unknown>;
  return (
    typeof raw.expectedBaseRef === "string" &&
    raw.expectedBaseRef.length > 0 &&
    typeof raw.expectedHeadSha === "string" &&
    raw.expectedHeadSha.length > 0 &&
    (raw.expectedStack === null ||
      isPullRequestStackIdentity(raw.expectedStack)) &&
    isMergeMethod(raw.method)
  );
};

export const isMergeStatusInput = (value: unknown): value is MergeStatusInput => {
  if (!isPullRequestIdentity(value)) return false;

  const requestId = (value as unknown as Record<string, unknown>).requestId;
  return (
    typeof requestId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      requestId,
    )
  );
};

const isKnownPullRequest = async ({
  owner,
  repository,
  pullNumber,
}: PullRequestIdentity) => {
  const cache = await getCachedData();
  return cache.flatPullRequests.some(
    (pullRequest) =>
      pullRequest.number === pullNumber &&
      pullRequest.base.repo.name === repository &&
      pullRequest.base.repo.owner?.login === owner,
  );
};

const getAllowedMethods = (repository: {
  allow_merge_commit?: boolean | null;
  allow_squash_merge?: boolean | null;
  allow_rebase_merge?: boolean | null;
}): MergeMethod[] =>
  MERGE_METHODS.filter((method) => {
    if (method === "merge") return repository.allow_merge_commit === true;
    if (method === "squash") return repository.allow_squash_merge === true;
    return repository.allow_rebase_merge === true;
  });

const getStack = (pullRequest: unknown) => {
  const stack = (pullRequest as {
    stack?: {
      number?: unknown;
      position?: unknown;
      size?: unknown;
      base?: { ref?: unknown } | null;
    } | null;
  }).stack;
  if (!stack) return null;
  if (
    typeof stack.number !== "number" ||
    !Number.isInteger(stack.number) ||
    typeof stack.position !== "number" ||
    !Number.isInteger(stack.position) ||
    typeof stack.size !== "number" ||
    !Number.isInteger(stack.size) ||
    typeof stack.base?.ref !== "string" ||
    stack.base.ref.length === 0
  ) {
    return null;
  }

  return {
    number: stack.number,
    position: stack.position,
    size: stack.size,
    baseRef: stack.base.ref,
  };
};

const isSameStack = (
  expected: PullRequestStackIdentity | null,
  current: ReturnType<typeof getStack>,
) =>
  expected === null
    ? current === null
    : current !== null &&
      expected.number === current.number &&
      expected.position === current.position &&
      expected.baseRef === current.baseRef;

const describeError = (error: unknown): MergeResult => {
  const details = error as { status?: number; message?: string };
  const message = details.message || "GitHub could not merge this pull request.";

  if (details.status === 403) {
    return { status: "failed", code: "forbidden", message };
  }
  if (details.status === 404) {
    return { status: "failed", code: "notFound", message };
  }
  if (
    details.status === 400 ||
    details.status === 405 ||
    details.status === 422
  ) {
    return { status: "failed", code: "notMergeable", message };
  }
  return { status: "failed", code: "unknown", message };
};

export const getMergeOptions = async (
  identity: PullRequestIdentity,
): Promise<MergeOptions | MergeResult> => {
  if (!(await isKnownPullRequest(identity))) {
    return {
      status: "failed",
      code: "invalid",
      message: "This pull request is no longer available in CozyWatch.",
    };
  }

  try {
    const client = await getGithubClient();
    const [pullRequest, repository] = await Promise.all([
      client.rest.pulls.get({
        owner: identity.owner,
        repo: identity.repository,
        pull_number: identity.pullNumber,
        headers: GITHUB_API_HEADERS,
      }),
      client.rest.repos.get({
        owner: identity.owner,
        repo: identity.repository,
        headers: GITHUB_API_HEADERS,
      }),
    ]);
    const methods = getAllowedMethods(repository.data);

    if (
      pullRequest.data.state !== "open" ||
      pullRequest.data.draft === true ||
      methods.length === 0
    ) {
      return {
        status: "failed",
        code: "notMergeable",
        message: "GitHub reports that this pull request cannot be merged.",
      };
    }

    const stack = getStack(pullRequest.data);

    return {
      ...identity,
      title: pullRequest.data.title,
      baseRef: stack?.baseRef ?? pullRequest.data.base.ref,
      headSha: pullRequest.data.head.sha,
      methods,
      stack,
    };
  } catch (error) {
    Logger.warn("[PullRequests] could not load merge options", error);
    return describeError(error);
  }
};

export const mergePullRequest = async (
  input: MergePullRequestInput,
): Promise<MergeResult> => {
  if (!(await isKnownPullRequest(input))) {
    return {
      status: "failed",
      code: "invalid",
      message: "This pull request is no longer available in CozyWatch.",
    };
  }

  try {
    const client = await getGithubClient();
    const [pullRequest, repository] = await Promise.all([
      client.rest.pulls.get({
        owner: input.owner,
        repo: input.repository,
        pull_number: input.pullNumber,
        headers: GITHUB_API_HEADERS,
      }),
      client.rest.repos.get({
        owner: input.owner,
        repo: input.repository,
        headers: GITHUB_API_HEADERS,
      }),
    ]);

    if (pullRequest.data.state !== "open") {
      return {
        status: "failed",
        code: "notMergeable",
        message: "This pull request is no longer open.",
      };
    }
    if (pullRequest.data.draft === true) {
      return {
        status: "failed",
        code: "notMergeable",
        message: "Draft pull requests cannot be merged.",
      };
    }
    const currentStack = getStack(pullRequest.data);
    const currentBaseRef = currentStack?.baseRef ?? pullRequest.data.base.ref;

    if (currentBaseRef !== input.expectedBaseRef) {
      return {
        status: "failed",
        code: "stale",
        message:
          "This pull request's base branch changed. Review the updated pull request before merging.",
      };
    }
    if (pullRequest.data.head.sha !== input.expectedHeadSha) {
      return {
        status: "failed",
        code: "stale",
        message: "New commits were pushed. Review the updated pull request before merging.",
      };
    }
    if (!isSameStack(input.expectedStack, currentStack)) {
      return {
        status: "failed",
        code: "stale",
        message:
          "This pull request's stack changed. Review the updated stack before merging.",
      };
    }
    if (!getAllowedMethods(repository.data).includes(input.method)) {
      return {
        status: "failed",
        code: "notMergeable",
        message: "That merge method is no longer available for this repository.",
      };
    }

    const response = await client.request({
      method: "PUT",
      url: `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}/pulls/${input.pullNumber}/merge-async`,
      headers: GITHUB_API_HEADERS,
      sha: input.expectedHeadSha,
      merge_method: input.method,
      merge_action: "default",
    });
    const data = response.data as {
      status?: "merged" | "pending";
      details?: { message?: string; uuid?: string };
    };
    const message = data.details?.message || "GitHub accepted the merge request.";

    if (data.status === "merged") {
      return { status: "merged", message };
    }
    if (response.status === 200 && data.status !== "pending") {
      return { status: "alreadyMerged", message };
    }
    return {
      status: "queued",
      message,
      requestId: data.details?.uuid,
    };
  } catch (error) {
    Logger.warn("[PullRequests] merge request failed", error);
    const conflict = error as {
      status?: number;
      response?: {
        data?: {
          message?: string;
          status?: string;
          uuid?: string;
          details?: {
            message?: string;
            uuid?: string;
            merge_method?: string;
          };
        };
      };
    };
    const requestId =
      conflict.response?.data?.details?.uuid || conflict.response?.data?.uuid;
    if (conflict.status === 409 && requestId) {
      const existingMethod = conflict.response?.data?.details?.merge_method;
      return {
        status: "existingRequest",
        message: isMergeMethod(existingMethod)
          ? `An existing ${existingMethod} merge request is already in progress. Your current selection was not submitted.`
          : "Another merge request is already in progress. Its options may differ from your selection, which was not submitted.",
        requestId,
      };
    }
    return describeError(error);
  }
};

export const getMergeStatus = async ({
  requestId,
  ...identity
}: MergeStatusInput): Promise<MergeStatusResult> => {
  try {
    const client = await getGithubClient();
    const response = await client.request({
      method: "GET",
      url: `/repos/${encodeURIComponent(identity.owner)}/${encodeURIComponent(identity.repository)}/pulls/${identity.pullNumber}/merge-async/${encodeURIComponent(requestId)}`,
      headers: GITHUB_API_HEADERS,
    });
    const data = response.data as {
      status?: "merged" | "pending" | "failed";
      details?: { message?: string };
    };
    const message = data.details?.message || "GitHub is processing the merge request.";
    if (data.status === "merged") return { status: "merged", message };
    if (data.status === "pending") return { status: "pending", message };
    return { status: "failed", code: "notMergeable", message };
  } catch (error) {
    const result = describeError(error);
    const code = result.status === "failed" ? result.code : "unknown";
    return {
      status: "failed",
      code: (() => {
        switch (code) {
          case "notMergeable":
          case "forbidden":
          case "notFound":
          case "unknown":
            return code;
          default:
            return "unknown";
        }
      })(),
      message: result.message,
    };
  }
};
