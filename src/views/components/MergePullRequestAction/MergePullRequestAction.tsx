import { Button, Callout, Dialog, Flex, Select, Text } from "@radix-ui/themes";
import { useEffect, useMemo, useState } from "react";
import type {
  MergeMethod,
  MergeOptions,
  MergeResult,
  PullRequestIdentity,
} from "../../../mainProcess/api/PullRequests/mergePullRequest";
import type { PullRequestList } from "../../../mainProcess/api/PullRequests/utils/getDefaultData";

interface Props {
  className?: string;
  pullRequest: PullRequestList[0];
}

const methodLabels: Record<MergeMethod, string> = {
  merge: "Create a merge commit",
  squash: "Squash and merge",
  rebase: "Rebase and merge",
};

const isMergeOptions = (
  result: MergeOptions | MergeResult,
): result is MergeOptions => "methods" in result;

export const MergePullRequestAction = ({
  className,
  pullRequest,
}: Props) => {
  const owner = pullRequest.base.repo.owner?.login;
  const repository = pullRequest.base.repo.name;
  const pullNumber = pullRequest.number;
  const identity = useMemo<PullRequestIdentity | null>(() => {
    if (!owner || !repository || !pullNumber) return null;
    return { owner, repository, pullNumber };
  }, [owner, repository, pullNumber]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [options, setOptions] = useState<MergeOptions | null>(null);
  const [method, setMethod] = useState<MergeMethod | null>(null);
  const [result, setResult] = useState<MergeResult | null>(null);

  useEffect(() => {
    if (
      (result?.status !== "queued" && result?.status !== "existingRequest") ||
      !result.requestId ||
      !identity
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      void window.electronAPI.pullRequest
        .getMergeStatus({ ...identity, requestId: result.requestId! })
        .then((status) => {
          if (status.status === "pending") return;
          setResult(status);
        })
        .catch(() => {
          // The queued state remains visible; a later poll can still resolve it.
        });
    }, 5_000);

    return () => window.clearInterval(interval);
  }, [identity, result]);

  if (!identity) return null;

  const handleOpenChange = (open: boolean) => {
    if (isSubmitting) return;
    setIsOpen(open);
    if (!open) {
      setOptions(null);
      setMethod(null);
      setResult(null);
    }
  };

  const handleOpen = async () => {
    setIsOpen(true);
    setIsLoadingOptions(true);
    setOptions(null);
    setMethod(null);
    setResult(null);

    try {
      const next = await window.electronAPI.pullRequest.getMergeOptions(identity);
      if (!isMergeOptions(next)) {
        setResult(next);
        return;
      }

      setOptions(next);
      setMethod(next.methods[0] ?? null);
    } catch {
      setResult({
        status: "failed",
        code: "unknown",
        message: "CozyWatch could not load merge options from GitHub.",
      });
    } finally {
      setIsLoadingOptions(false);
    }
  };

  const handleMerge = async () => {
    if (!options || !method) return;

    setIsSubmitting(true);
    setResult(null);
    try {
      const next = await window.electronAPI.pullRequest.merge({
        ...identity,
        expectedBaseRef: options.baseRef,
        expectedHeadSha: options.headSha,
        expectedStack: options.stack
          ? {
              number: options.stack.number,
              position: options.stack.position,
              baseRef: options.stack.baseRef,
            }
          : null,
        method,
      });
      setResult(next);
    } catch {
      setResult({
        status: "failed",
        code: "unknown",
        message: "CozyWatch could not submit the merge request.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit =
    !!options &&
    !!method &&
    !result &&
    !isLoadingOptions &&
    !isSubmitting;

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
      <Dialog.Trigger>
        <Button
          className={className}
          color="green"
          size="1"
          onClick={handleOpen}
        >
          Merge
        </Button>
      </Dialog.Trigger>

      <Dialog.Content maxWidth="440px">
        <Dialog.Title>Merge pull request</Dialog.Title>
        <Dialog.Description size="2" mb="4">
          {options
            ? `Merge “${options.title}” into ${options.baseRef}.`
            : "Checking the current pull request status on GitHub."}
        </Dialog.Description>

        <Flex direction="column" gap="3">
          {options && options.methods.length > 1 && (
            <Flex direction="column" gap="1">
              <Text size="2" weight="medium">
                Merge method
              </Text>
              <Select.Root
                value={method ?? undefined}
                onValueChange={(value) => setMethod(value as MergeMethod)}
              >
                <Select.Trigger />
                <Select.Content>
                  {options.methods.map((availableMethod) => (
                    <Select.Item key={availableMethod} value={availableMethod}>
                      {methodLabels[availableMethod]}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Flex>
          )}

          {options && options.methods.length === 1 && method && (
            <Text size="2">
              Method: {methodLabels[method]}
            </Text>
          )}

          {options?.stack && options.stack.position > 1 && (
            <Callout.Root color="amber" size="1">
              <Callout.Text>
                This is pull request {options.stack.position} of {options.stack.size} in a
                stack. GitHub will merge or queue this pull request and the {" "}
                {options.stack.position - 1} pull request
                {options.stack.position === 2 ? "" : "s"} below it as one atomic
                operation.
              </Callout.Text>
            </Callout.Root>
          )}

          {result && (
            <Callout.Root
              color={
                result.status === "failed"
                  ? "red"
                  : result.status === "existingRequest"
                    ? "amber"
                    : "green"
              }
              size="1"
            >
              <Callout.Text>{result.message}</Callout.Text>
            </Callout.Root>
          )}
        </Flex>

        <Flex gap="3" mt="5" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray" disabled={isSubmitting}>
              {result ? "Close" : "Cancel"}
            </Button>
          </Dialog.Close>
          <Button
            color="green"
            loading={isLoadingOptions || isSubmitting}
            disabled={!canSubmit}
            onClick={handleMerge}
          >
            {result?.status === "queued"
              ? "Merge queued"
              : result?.status === "existingRequest"
                ? "Existing merge queued"
              : result?.status === "merged" ||
                  result?.status === "alreadyMerged"
                ? "Merged"
                : "Confirm merge"}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};
