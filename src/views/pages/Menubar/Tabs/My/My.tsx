import { Flex, Spinner, Switch, Text } from "@radix-ui/themes";

import { useState } from "react";
import { PullRequestList } from "src/mainProcess/api/PullRequests/utils/getDefaultData";
import { PullRequestCard } from "../../../../components/PullRequestsCard/PullRequestsCard";
import { useTabs } from "../useTabs";
import { Empty } from "../../components/Empty/Empty";

interface Props {
  pullRequests: PullRequestList;
  isCompact: boolean;
}

export const My = ({ pullRequests, isCompact }: Props) => {
  const [isWaitingForReview, setIsWaitingForReview] = useState(false);
  const { isFetching, error, data } = useTabs(pullRequests);

  if (isFetching) {
    return (
      <Flex
        direction="column"
        height="100vh"
        width="100vw"
        p={isCompact ? "2" : "3"}
        align="center"
        justify="center"
      >
        <Spinner />
      </Flex>
    );
  }

  if (error) {
    return <Text color="red">Error loading pull requests</Text>;
  }

  if (!data) {
    return null;
  }

  const myPullRequestsCount = data.filter(({ waitingReviews }) => {
    return isWaitingForReview ? waitingReviews > 0 : true;
  });

  return (
    <Flex
      gap="2"
      direction="column"
      width="100%"
      minHeight="100%"
      px={isCompact ? "2" : "3"}
      pb={isCompact ? "4" : "5"}
      pt={isCompact ? "2" : "3"}
    >
      <Flex align="center" gap="2" py="4" mt="-4" mb="-4">
        <Switch
          size="1"
          checked={isWaitingForReview}
          onCheckedChange={async (checked) => {
            setIsWaitingForReview(checked);
          }}
        />
        <Text size={isCompact ? "1" : "2"} className="mb-text-color-heading">
          Show waiting for review
        </Text>
      </Flex>

      {myPullRequestsCount.length === 0 && (
        <Empty>
          <Text style={{ color: "var(--white-a11)" }}>
            {isWaitingForReview
              ? "There are no pending reviews."
              : "You have no open pull requests."}
          </Text>
        </Empty>
      )}

      {myPullRequestsCount.map(({ pr, reviewsAndWaitingReviews, actionByName, pullRequestUrl, waitingReviews, assignees, latestFeedbackAt, latestMention }) => (
        <PullRequestCard
          key={pr.id}
          isCompact={isCompact}
          pullRequest={pr}
          waitingReviews={waitingReviews}
          reviewsGroupedbyUser={reviewsAndWaitingReviews}
          avatarUrl={pr.user?.avatar_url}
          login={pr.user?.login}
          title={pr.title}
          htmlUrl={pr.html_url}
          baseBranchName={pr.base.ref}
          branchName={pr.head.ref}
          repositoryName={pr.head.repo?.name ?? pr.base.repo.name}
          updatedAt={pr.updated_at}
          latestFeedbackAt={latestFeedbackAt}
          latestMention={latestMention}
          actionsByName={actionByName}
          pullRequestLink={pullRequestUrl}
          labels={pr.labels}
          assignees={assignees}
        />
      ))}
    </Flex>
  );
};
