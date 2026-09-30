import { ChevronDownIcon } from "@primer/octicons-react";
import { Box, Flex, Text } from "@radix-ui/themes";
import { useId, useMemo, useState } from "react";
import { ActivityContent } from "../../../ActivityContent/ActivityContent";
import { GitHubLink } from "../../../ActivityContent/GitHubLink";
import { getHumanState } from "../../Review.utils";
import { State } from "../../Reviews.meta";
import { ReviewAvatar } from "../ReviewAvatar/ReviewAvatar";
import { LastUpdate } from "../../../PullRequestsCard/components/LastUpdate/LastUpdate";

interface Props {
  inline?: boolean;
  pullRequestUrl: string;
  reviewsGroupedbyUser?: Record<
    string,
    {
      state: string;
      userAvatar: string;
      userName: string;
      body: string;
      date: string;
      html_url?: string;
    }
  >;
}

export const LastActivity = ({
  reviewsGroupedbyUser,
  pullRequestUrl,
  inline = false,
}: Props) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentId = useId();
  const feedback = useMemo(
    () =>
      Object.values(reviewsGroupedbyUser || {}).filter(
        (review) => review.state !== "NO_FEEDBACK",
      ),
    [reviewsGroupedbyUser],
  );
  if (feedback.length === 0) return null;

  return (
    <Flex className="activity-panel" direction="column" p="3" gap="2">
      {inline ? (
        <Text size="1" weight="medium" color="gray">Latest activity</Text>
      ) : (
        <button
          type="button"
          className="activity-toggle"
          aria-expanded={isExpanded}
          aria-controls={contentId}
          onClick={() => setIsExpanded((state) => !state)}
        >
          Latest Activity
          <span
            style={{
              display: "inline-flex",
              transform: isExpanded ? "rotate(180deg)" : undefined,
            }}
          >
            <ChevronDownIcon size={16} />
          </span>
        </button>
      )}
      <div id={contentId} hidden={!inline && !isExpanded}>
        {(inline || isExpanded) && (
          <Flex py="2" gap="4" direction="column">
            {feedback.map((review) => (
              <Flex
                key={review.userName}
                width="100%"
                gap="3"
                className="activity-entry"
              >
                <Box>
                  <ReviewAvatar
                    state={review.state}
                    userAvatar={review.userAvatar}
                    userName={review.userName}
                  />
                </Box>
                <Flex
                  direction="column"
                  gap="2"
                  style={{ minWidth: 0, flex: 1 }}
                >
                  <Flex align="center" gap="2" wrap="wrap">
                    <Text size="2" weight="medium">
                      {review.userName}
                    </Text>
                    <Text size="1" color="gray">
                      {getHumanState(review.state as State)}
                    </Text>
                    {review.date && <LastUpdate updatedAt={review.date} />}
                  </Flex>
                  {review.body && (
                    <ActivityContent
                      body={review.body}
                      sourceUrl={review.html_url || pullRequestUrl}
                    />
                  )}
                  <GitHubLink href={review.html_url || pullRequestUrl}>
                    Open on GitHub ↗
                  </GitHubLink>
                </Flex>
              </Flex>
            ))}
          </Flex>
        )}
      </div>
    </Flex>
  );
};
