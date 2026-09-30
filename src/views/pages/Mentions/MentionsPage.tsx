import { Box, Callout, Flex, VisuallyHidden } from "@radix-ui/themes";
import { EmptyPullRequests } from "../../components/EmptyPullRequests/EmptyPullRequests";
import { LoadingPage } from "../../components/LoadingPage/LoadingPage";
import { PullRequestCard } from "../../components/PullRequestsCard/PullRequestsCard";
import { useMentionedPullRequests } from "../PullRequestScope/usePullRequestScope";

export const MentionsPage = () => {
  const { data, error, isFetching } = useMentionedPullRequests();

  if (isFetching && !data) {
    return <LoadingPage />;
  }

  if (error) {
    return (
      <Flex align="center" direction="column" flexGrow="1" justify="center">
        <Callout.Root>
          <Callout.Text>{error.message}</Callout.Text>
        </Callout.Root>
      </Flex>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <Flex direction="column" flexGrow="1" minHeight="0" overflow="auto">
      <VisuallyHidden asChild>
        <h1>Mentions</h1>
      </VisuallyHidden>
      {data.cards.length === 0 ? (
        <EmptyPullRequests />
      ) : (
        <Flex direction="column" gap="3" p="4">
          {data.cards.map((card) => (
            <Box key={card.pr.id} width="100%">
              <PullRequestCard
                pullRequest={card.pr}
                waitingReviews={card.waitingReviews}
                reviewsGroupedbyUser={card.reviewsAndWaitingReviews}
                avatarUrl={card.pr.user?.avatar_url}
                login={card.pr.user?.login}
                title={card.pr.title}
                htmlUrl={card.pr.html_url}
                baseBranchName={card.pr.base.ref}
                branchName={card.pr.head.ref}
                repositoryName={card.pr.head.repo?.name ?? card.pr.base.repo.name}
                updatedAt={card.pr.updated_at}
                latestFeedbackAt={card.latestFeedbackAt}
                latestMention={card.latestMention}
                actionsByName={card.actionByName}
                pullRequestLink={card.pullRequestUrl}
                labels={card.labels}
                assignees={card.assignees}
              />
            </Box>
          ))}
        </Flex>
      )}
    </Flex>
  );
};
