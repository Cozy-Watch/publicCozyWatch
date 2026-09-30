import {
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  LinkExternalIcon,
  SkipIcon,
  XCircleIcon,
} from "@primer/octicons-react";
import { Flex, Popover, Text } from "@radix-ui/themes";
import type { PullsActions } from "src/mainProcess/api/PullRequests/utils/getDefaultData";
import { GitHubLink } from "../../../ActivityContent/GitHubLink";

interface Props {
  actionsByName: Record<string, PullsActions[0][]>;
  pullRequestLink: string;
  isCompact?: boolean;
}

const getRunState = ({ status, conclusion }: PullsActions[0]) => {
  if (status !== "completed") return { tone: "pending", label: "Running", Icon: ClockIcon };
  if (conclusion === "success") return { tone: "success", label: "Passed", Icon: CheckCircleIcon };
  if (conclusion === "skipped" || conclusion === "neutral") {
    return { tone: "neutral", label: conclusion === "skipped" ? "Skipped" : "Neutral", Icon: SkipIcon };
  }
  return { tone: "danger", label: conclusion?.replaceAll("_", " ") || "Failed", Icon: XCircleIcon };
};

export const CIActions = ({ actionsByName, pullRequestLink }: Props) => {
  const runs = Object.values(actionsByName).flatMap((actions) => actions[0] ? [actions[0]] : []);
  if (runs.length === 0) return null;

  const states = runs.map(getRunState);
  const failed = states.filter(({ tone }) => tone === "danger").length;
  const pending = states.filter(({ tone }) => tone === "pending").length;
  const passed = states.filter(({ tone }) => tone === "success").length;
  const tone = failed > 0 ? "danger" : pending > 0 ? "pending" : passed === runs.length ? "success" : "neutral";
  const Icon = failed > 0 ? XCircleIcon : pending > 0 ? ClockIcon : CheckCircleIcon;
  const label = failed > 0
    ? `${failed} failed`
    : pending > 0
      ? `${pending} running`
      : passed === runs.length ? "Checks passed" : "Checks complete";

  return (
    <Popover.Root>
      <Popover.Trigger>
        <button type="button" className="pr-status" data-tone={tone} aria-label={`CI checks: ${label}`}>
          <Icon size={14} aria-hidden="true" />
          {label}
          <ChevronDownIcon size={12} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Content width="300px" className="pr-popover">
        <Flex direction="column" gap="3">
          <Text size="2" weight="medium">{passed}/{runs.length} checks passed</Text>
          <Flex direction="column" gap="1">
            {runs.map((action) => {
              const state = getRunState(action);
              return (
                <GitHubLink key={action.id} href={action.html_url || pullRequestLink} className="ci-run-link">
                  <Flex align="center" gap="2">
                    <span className="pr-review-state" data-tone={state.tone}>
                      <state.Icon size={16} aria-hidden="true" />
                    </span>
                    <Flex direction="column" gap="1" minWidth="0">
                      <Text size="2" style={{ overflowWrap: "anywhere" }}>{action.name}</Text>
                      <Text size="1" color="gray" style={{ textTransform: "capitalize" }}>{state.label}</Text>
                    </Flex>
                  </Flex>
                </GitHubLink>
              );
            })}
          </Flex>
          <GitHubLink href={pullRequestLink}>View on GitHub <LinkExternalIcon size={12} /></GitHubLink>
        </Flex>
      </Popover.Content>
    </Popover.Root>
  );
};
