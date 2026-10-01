import { Box, Callout, Flex, VisuallyHidden } from "@radix-ui/themes";
import { EmptyPullRequests } from "../../components/EmptyPullRequests/EmptyPullRequests";
import { LoadingPage } from "../../components/LoadingPage/LoadingPage";
import { PullRequestCard } from "../../components/PullRequestsCard/PullRequestsCard";
import {
  type PullRequestFilter,
  type PullRequestScope,
  usePullRequestScope,
} from "./usePullRequestScope";

interface PullRequestScopePageProps {
  filter: PullRequestFilter;
  scope: PullRequestScope;
}

const scopeTitle = (scope: PullRequestScope) =>
  scope === "my" ? "My PRs" : "Relevant";

const filterTitle = (scope: PullRequestScope, filter: PullRequestFilter) => {
  if (filter === "all") return "All pull requests";
  if (filter === "fullyApproved") return "Fully approved";
  if (filter === "pendingReviews") {
    return scope === "my" ? "Pending review" : "Awaiting my review";
  }
  return scope === "my" ? "Reviewed" : "Reviewed by me";
};

export const PullRequestScopePage = ({
  filter,
  scope,
}: PullRequestScopePageProps) => {
  const { data, error, isFetching } = usePullRequestScope(scope, filter);

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

  const title = `${scopeTitle(scope)}: ${filterTitle(scope, filter)}`;

  return (
    <Flex className="desktop-filtered-scroll" direction="column" flexGrow="1" minHeight="0" overflow="auto">
      <VisuallyHidden asChild>
        <h1>{title}</h1>
      </VisuallyHidden>
      {data.cards.length === 0 ? (
        <EmptyPullRequests
          message={
            scope === "my"
              ? filter === "all"
                ? "You have no open pull requests."
                : filter === "pendingReviews"
                  ? "There are no pending reviews."
                  : undefined
              : undefined
          }
        />
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
