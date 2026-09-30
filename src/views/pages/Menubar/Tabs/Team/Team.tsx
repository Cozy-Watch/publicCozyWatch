import { Flex, Spinner, Text } from "@radix-ui/themes";
import { PullRequestList } from "src/mainProcess/api/PullRequests/utils/getDefaultData";
import { Empty } from "../../components/Empty/Empty";
import { PullRequestCard } from "../../../../components/PullRequestsCard/PullRequestsCard";
import { useTabs } from "../useTabs";

interface Props {
  pullRequests: PullRequestList;
  isCompact: boolean;
}

export const Team = ({ pullRequests, isCompact }: Props) => {
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

  return (
    <Flex
      gap="4"
      direction="column"
      width="100%"
      minHeight="100%"
      px={isCompact ? "2" : "3"}
      pb={isCompact ? "4" : "5"}
      pt={isCompact ? "2" : "3"}
    >
      {data.length === 0 && <Empty />}

      {data.map(({ pr, reviewsAndWaitingReviews, actionByName, pullRequestUrl, waitingReviews, assignees, latestFeedbackAt, latestMention }) => (
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
