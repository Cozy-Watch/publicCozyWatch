import { ArrowRightIcon, CopyIcon } from "@primer/octicons-react";
import { Flex, Text, Tooltip } from "@radix-ui/themes";
import { useState } from "react";

interface Props {
  branchName: string;
  baseBranchName: string;
}

export const MergeInfo = ({ branchName, baseBranchName }: Props) => {
  const [copyStatus, setCopyStatus] = useState("");

  return (
    <Flex direction="column" gap="1">
      <Flex align="center" gap="2" wrap="wrap" style={{ fontSize: 12, color: "var(--gray-11)" }}>
        <Tooltip content={`Copy ${branchName}`}>
          <button
            type="button"
            className="pr-branch-copy"
            aria-label={`Copy branch ${branchName}`}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(branchName);
                setCopyStatus("Branch copied");
              } catch {
                setCopyStatus("Could not copy branch");
              }
            }}
          >
            <CopyIcon size={12} aria-hidden="true" />
            {branchName}
          </button>
        </Tooltip>
        <ArrowRightIcon size={12} aria-label="into" />
        <Text style={{ overflowWrap: "anywhere", minWidth: 0 }}>{baseBranchName}</Text>
      </Flex>
      {copyStatus && <Text size="1" color="gray" role="status">{copyStatus}</Text>}
    </Flex>
  );
};
