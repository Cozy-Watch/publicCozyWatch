jest.mock("electron-log", () => ({ warn: jest.fn() }));
jest.mock("../githubClient", () => ({ getGithubClient: jest.fn() }));
jest.mock("./utils/getDefaultData", () => ({ getCachedData: jest.fn() }));

import {
  getMergeOptions,
  getMergeStatus,
  isMergePullRequestInput,
  isMergeStatusInput,
  isPullRequestIdentity,
  mergePullRequest,
} from "./mergePullRequest";
import { getGithubClient } from "../githubClient";
import { getCachedData } from "./utils/getDefaultData";

describe("pull request merge IPC validation", () => {
  const identity = {
    owner: "cozy-watch",
    repository: "cozywatch",
    pullNumber: 42,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("accepts a complete pull request identity", () => {
    expect(isPullRequestIdentity(identity)).toBe(true);
  });

  test.each([
    { ...identity, owner: "" },
    { ...identity, repository: "" },
    { ...identity, pullNumber: 0 },
    { ...identity, pullNumber: 1.5 },
    { ...identity, pullNumber: "42" },
    null,
  ])("rejects an invalid pull request identity", (value) => {
    expect(isPullRequestIdentity(value)).toBe(false);
  });

  test("accepts only known merge methods with a head SHA", () => {
    expect(
      isMergePullRequestInput({
        ...identity,
        expectedBaseRef: "",
        expectedHeadSha: "abc123",
        expectedStack: null,
        method: "squash",
      }),
    ).toBe(false);
    expect(
      isMergePullRequestInput({
        ...identity,
        expectedBaseRef: "main",
        expectedHeadSha: "abc123",
        expectedStack: null,
        method: "squash",
      }),
    ).toBe(true);
    expect(
      isMergePullRequestInput({
        ...identity,
        expectedBaseRef: "main",
        expectedHeadSha: "",
        expectedStack: null,
        method: "squash",
      }),
    ).toBe(false);
    expect(
      isMergePullRequestInput({
        ...identity,
        expectedBaseRef: "main",
        expectedHeadSha: "abc123",
        expectedStack: null,
        method: "invalid",
      }),
    ).toBe(false);
  });

  test("accepts only UUID merge status identifiers", () => {
    expect(
      isMergeStatusInput({
        ...identity,
        requestId: "630b9d5e-3f2a-4f7e-8b0c-2d5f9a8c1e42",
      }),
    ).toBe(true);
    expect(isMergeStatusInput({ ...identity, requestId: "request-1" })).toBe(
      false,
    );
  });

  test("returns only merge methods enabled by the repository", async () => {
    const client = {
      rest: {
        pulls: {
          get: jest.fn().mockResolvedValue({
            data: {
              state: "open",
              title: "Improve merge flow",
              head: { sha: "abc123" },
              base: { ref: "main" },
              stack: {
                number: 7,
                position: 2,
                size: 3,
                base: { ref: "release" },
              },
            },
          }),
        },
        repos: {
          get: jest.fn().mockResolvedValue({
            data: {
              allow_merge_commit: false,
              allow_squash_merge: true,
              allow_rebase_merge: true,
            },
          }),
        },
      },
      request: jest.fn(),
    };
    jest.mocked(getCachedData).mockResolvedValue({
      flatPullRequests: [
        {
          number: identity.pullNumber,
          base: { repo: { name: identity.repository, owner: { login: identity.owner } } },
        },
      ],
    } as never);
    jest.mocked(getGithubClient).mockResolvedValue(client as never);

    await expect(getMergeOptions(identity)).resolves.toEqual({
      ...identity,
      title: "Improve merge flow",
      baseRef: "release",
      headSha: "abc123",
      methods: ["squash", "rebase"],
      stack: { number: 7, position: 2, size: 3, baseRef: "release" },
    });
  });

  test("submits the chosen method with GitHub's default merge action", async () => {
    const client = {
      rest: {
        pulls: {
          get: jest.fn().mockResolvedValue({
            data: {
              state: "open",
              base: { ref: "main" },
              head: { sha: "abc123" },
            },
          }),
        },
        repos: {
          get: jest.fn().mockResolvedValue({
            data: {
              allow_merge_commit: true,
              allow_squash_merge: true,
              allow_rebase_merge: false,
            },
          }),
        },
      },
      request: jest.fn().mockResolvedValue({
        status: 202,
        data: {
          status: "pending",
          details: {
            message: "Queued",
            uuid: "630b9d5e-3f2a-4f7e-8b0c-2d5f9a8c1e42",
          },
        },
      }),
    };
    jest.mocked(getCachedData).mockResolvedValue({
      flatPullRequests: [
        {
          number: identity.pullNumber,
          base: { repo: { name: identity.repository, owner: { login: identity.owner } } },
        },
      ],
    } as never);
    jest.mocked(getGithubClient).mockResolvedValue(client as never);

    await expect(
      mergePullRequest({
        ...identity,
        expectedBaseRef: "main",
        expectedHeadSha: "abc123",
        expectedStack: null,
        method: "squash",
      }),
    ).resolves.toEqual({
      status: "queued",
      message: "Queued",
      requestId: "630b9d5e-3f2a-4f7e-8b0c-2d5f9a8c1e42",
    });
    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({ merge_method: "squash", merge_action: "default", sha: "abc123" }),
    );
  });

  test("returns the existing async request when GitHub responds with 409", async () => {
    const requestId = "630b9d5e-3f2a-4f7e-8b0c-2d5f9a8c1e42";
    const client = {
      rest: {
        pulls: {
          get: jest.fn().mockResolvedValue({
            data: {
              state: "open",
              draft: false,
              base: { ref: "main" },
              head: { sha: "abc123" },
            },
          }),
        },
        repos: {
          get: jest.fn().mockResolvedValue({
            data: { allow_merge_commit: true },
          }),
        },
      },
      request: jest.fn().mockRejectedValue({
        status: 409,
        response: {
          data: {
            details: {
              message: "Already queued",
              uuid: requestId,
              merge_method: "rebase",
            },
          },
        },
      }),
    };
    jest.mocked(getCachedData).mockResolvedValue({
      flatPullRequests: [
        {
          number: identity.pullNumber,
          base: {
            repo: {
              name: identity.repository,
              owner: { login: identity.owner },
            },
          },
        },
      ],
    } as never);
    jest.mocked(getGithubClient).mockResolvedValue(client as never);

    await expect(
      mergePullRequest({
        ...identity,
        expectedBaseRef: "main",
        expectedHeadSha: "abc123",
        expectedStack: null,
        method: "merge",
      }),
    ).resolves.toEqual({
      status: "existingRequest",
      message:
        "An existing rebase merge request is already in progress. Your current selection was not submitted.",
      requestId,
    });
  });

  test("rejects draft pull requests during preflight", async () => {
    const client = {
      rest: {
        pulls: {
          get: jest.fn().mockResolvedValue({
            data: {
              state: "open",
              draft: true,
              title: "Draft change",
              head: { sha: "abc123" },
            },
          }),
        },
        repos: {
          get: jest.fn().mockResolvedValue({
            data: { allow_merge_commit: true },
          }),
        },
      },
    };
    jest.mocked(getCachedData).mockResolvedValue({
      flatPullRequests: [
        {
          number: identity.pullNumber,
          base: {
            repo: {
              name: identity.repository,
              owner: { login: identity.owner },
            },
          },
        },
      ],
    } as never);
    jest.mocked(getGithubClient).mockResolvedValue(client as never);

    await expect(getMergeOptions(identity)).resolves.toEqual({
      status: "failed",
      code: "notMergeable",
      message: "GitHub reports that this pull request cannot be merged.",
    });
  });

  test("rejects a merge when stack membership changed after confirmation", async () => {
    const client = {
      rest: {
        pulls: {
          get: jest.fn().mockResolvedValue({
            data: {
              state: "open",
              draft: false,
              head: { sha: "abc123" },
              stack: {
                number: 7,
                position: 2,
                size: 3,
                base: { ref: "main" },
              },
            },
          }),
        },
        repos: {
          get: jest.fn().mockResolvedValue({
            data: { allow_merge_commit: true },
          }),
        },
      },
      request: jest.fn(),
    };
    jest.mocked(getCachedData).mockResolvedValue({
      flatPullRequests: [
        {
          number: identity.pullNumber,
          base: {
            repo: {
              name: identity.repository,
              owner: { login: identity.owner },
            },
          },
        },
      ],
    } as never);
    jest.mocked(getGithubClient).mockResolvedValue(client as never);

    await expect(
      mergePullRequest({
        ...identity,
        expectedBaseRef: "main",
        expectedHeadSha: "abc123",
        expectedStack: { number: 7, position: 1, baseRef: "main" },
        method: "merge",
      }),
    ).resolves.toEqual({
      status: "failed",
      code: "stale",
      message:
        "This pull request's stack changed. Review the updated stack before merging.",
    });
    expect(client.request).not.toHaveBeenCalled();
  });

  test("rejects a merge when the stack target changed after confirmation", async () => {
    const client = {
      rest: {
        pulls: {
          get: jest.fn().mockResolvedValue({
            data: {
              state: "open",
              draft: false,
              head: { sha: "abc123" },
              stack: {
                number: 7,
                position: 2,
                size: 3,
                base: { ref: "main" },
              },
            },
          }),
        },
        repos: {
          get: jest.fn().mockResolvedValue({
            data: { allow_merge_commit: true },
          }),
        },
      },
      request: jest.fn(),
    };
    jest.mocked(getCachedData).mockResolvedValue({
      flatPullRequests: [
        {
          number: identity.pullNumber,
          base: {
            repo: {
              name: identity.repository,
              owner: { login: identity.owner },
            },
          },
        },
      ],
    } as never);
    jest.mocked(getGithubClient).mockResolvedValue(client as never);

    await expect(
      mergePullRequest({
        ...identity,
        expectedBaseRef: "release",
        expectedHeadSha: "abc123",
        expectedStack: { number: 7, position: 2, baseRef: "release" },
        method: "merge",
      }),
    ).resolves.toEqual({
      status: "failed",
      code: "stale",
      message:
        "This pull request's base branch changed. Review the updated pull request before merging.",
    });
    expect(client.request).not.toHaveBeenCalled();
  });

  test("rejects a merge when an unstacked pull request changes base", async () => {
    const client = {
      rest: {
        pulls: {
          get: jest.fn().mockResolvedValue({
            data: {
              state: "open",
              draft: false,
              base: { ref: "release" },
              head: { sha: "abc123" },
            },
          }),
        },
        repos: {
          get: jest.fn().mockResolvedValue({
            data: { allow_merge_commit: true },
          }),
        },
      },
      request: jest.fn(),
    };
    jest.mocked(getCachedData).mockResolvedValue({
      flatPullRequests: [
        {
          number: identity.pullNumber,
          base: {
            repo: {
              name: identity.repository,
              owner: { login: identity.owner },
            },
          },
        },
      ],
    } as never);
    jest.mocked(getGithubClient).mockResolvedValue(client as never);

    await expect(
      mergePullRequest({
        ...identity,
        expectedBaseRef: "main",
        expectedHeadSha: "abc123",
        expectedStack: null,
        method: "merge",
      }),
    ).resolves.toEqual({
      status: "failed",
      code: "stale",
      message:
        "This pull request's base branch changed. Review the updated pull request before merging.",
    });
    expect(client.request).not.toHaveBeenCalled();
  });

  test("continues polling a merge after its pull request leaves the cache", async () => {
    const requestId = "630b9d5e-3f2a-4f7e-8b0c-2d5f9a8c1e42";
    const client = {
      request: jest.fn().mockResolvedValue({
        data: { status: "pending", details: { message: "Queued" } },
      }),
    };
    jest.mocked(getCachedData).mockResolvedValue({ flatPullRequests: [] } as never);
    jest.mocked(getGithubClient).mockResolvedValue(client as never);

    await expect(
      getMergeStatus({ ...identity, requestId }),
    ).resolves.toEqual({ status: "pending", message: "Queued" });
    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        url: `/repos/${identity.owner}/${identity.repository}/pulls/${identity.pullNumber}/merge-async/${requestId}`,
      }),
    );
  });
});
