export const MERGE_METHODS = ["merge", "squash", "rebase"] as const;
export type MergeMethod = (typeof MERGE_METHODS)[number];

export const PULL_REQUEST_MERGE_CHANNELS = {
  options: "pull-request-merge-options",
  merge: "pull-request-merge",
  status: "pull-request-merge-status",
} as const;

export interface PullRequestStackIdentity {
  number: number;
  position: number;
  baseRef: string;
}

export interface PullRequestIdentity {
  owner: string;
  repository: string;
  pullNumber: number;
}

export interface MergeOptions extends PullRequestIdentity {
  title: string;
  baseRef: string;
  headSha: string;
  methods: MergeMethod[];
  stack: (PullRequestStackIdentity & { size: number }) | null;
}

export interface MergePullRequestInput extends PullRequestIdentity {
  expectedBaseRef: string;
  expectedHeadSha: string;
  expectedStack: PullRequestStackIdentity | null;
  method: MergeMethod;
}

export interface MergeStatusInput extends PullRequestIdentity {
  requestId: string;
}

export type MergeResult =
  | { status: "merged"; message: string }
  | { status: "queued"; message: string; requestId?: string }
  | { status: "existingRequest"; message: string; requestId: string }
  | { status: "alreadyMerged"; message: string }
  | {
      status: "failed";
      code:
        | "stale"
        | "notMergeable"
        | "forbidden"
        | "notFound"
        | "invalid"
        | "unknown";
      message: string;
    };

export type MergeStatusResult =
  | { status: "pending"; message: string }
  | { status: "merged"; message: string }
  | {
      status: "failed";
      code: "notMergeable" | "forbidden" | "notFound" | "unknown";
      message: string;
    };
