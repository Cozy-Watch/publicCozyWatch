import {
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  CodeReviewIcon,
  CommentIcon,
  XCircleIcon,
} from "@primer/octicons-react";
import { Avatar, Flex, Popover, Text } from "@radix-ui/themes";

interface Props {
  waitingReviews: number;
  reviewsGroupedbyUser?: Record<
    string,
    { state: string; userAvatar: string; userName: string }
  >;
}

const reviewStates = {
  APPROVED: { label: "Approved", tone: "success", Icon: CheckCircleIcon },
  CHANGES_REQUESTED: { label: "Changes requested", tone: "danger", Icon: XCircleIcon },
  NO_FEEDBACK: { label: "Pending", tone: "pending", Icon: ClockIcon },
  COMMENTED: { label: "Commented", tone: "neutral", Icon: CommentIcon },
  DISMISSED: { label: "Dismissed", tone: "neutral", Icon: CodeReviewIcon },
};

export const Review = ({ reviewsGroupedbyUser, waitingReviews }: Props) => {
  const reviews = Object.values(reviewsGroupedbyUser ?? {});
  const approved = reviews.filter(({ state }) => state === "APPROVED").length;
  const changes = reviews.filter(({ state }) => state === "CHANGES_REQUESTED").length;
  const pending = Math.max(
    waitingReviews,
    reviews.filter(({ state }) => state === "NO_FEEDBACK").length,
  );

  if (reviews.length === 0 && pending === 0) return null;

  const tone = changes > 0 ? "danger" : pending > 0 ? "pending" : approved > 0 ? "success" : "neutral";
  const Icon = changes > 0 ? XCircleIcon : pending > 0 ? ClockIcon : approved > 0 ? CheckCircleIcon : CodeReviewIcon;
  const label = changes > 0
    ? "Changes requested"
    : pending > 0
      ? `${pending} pending`
      : approved > 0
        ? `${approved} approval${approved === 1 ? "" : "s"}`
        : "Reviewed";

  return (
    <Popover.Root>
      <Popover.Trigger>
        <button type="button" className="pr-status" data-tone={tone} aria-label={`Reviews: ${label}`}>
          <Icon size={14} aria-hidden="true" />
          {label}
          <ChevronDownIcon size={12} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Content width="300px" className="pr-popover">
        <Flex direction="column" gap="3">
          <Text size="2" weight="medium">Reviews</Text>
          {reviews.map(({ state, userAvatar, userName }) => {
            const status = reviewStates[state as keyof typeof reviewStates] ?? reviewStates.COMMENTED;
            return (
              <Flex key={userName} align="center" gap="2">
                <Avatar src={userAvatar} fallback={userName?.slice(0, 2) || "?"} size="1" radius="full" />
                <Text size="1" className="pr-review-name">{userName}</Text>
                <span className="pr-review-state" data-tone={status.tone}>
                  <status.Icon size={12} aria-hidden="true" />
                  {status.label}
                </span>
              </Flex>
            );
          })}
          {pending > 0 && (
            <Text size="1" color="gray">Waiting for {pending} review{pending === 1 ? "" : "s"}</Text>
          )}
        </Flex>
      </Popover.Content>
    </Popover.Root>
  );
};
