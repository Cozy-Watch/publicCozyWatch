import { CalendarIcon, RocketIcon } from "@primer/octicons-react";
import { Box, Flex, Text } from "@radix-ui/themes";
import { PullRequestCard } from "../..//components/PullRequestsCard/PullRequestsCard";
import { PullRequestLoading } from "../../components/PullRequestsCard/PullRequestsCard.loading";
import { Stats } from "./components/Stats/Stats";
import { WeeklyRecap } from "./components/WeeklyRecap/WeeklyRecap";
import { useOverView } from "./useOverview";

export const Overview = () => {
  return (
    <Flex
      direction="column"
      overflow="auto"
      style={{ paddingLeft: "var(--space-6)", paddingRight: "var(--space-4)" }}
    >
      <Flex
        top="0"
        position="sticky"
        direction="column"
        gap="3"
        align="start"
        justify="center"
        pt="4"
        pb="4"
        style={{
          borderRadius: "8px",
          backdropFilter: "blur(9px)",
          zIndex: 2,
          maskImage: `linear-gradient(to bottom,black 0% 100%,red 0% 100%)`,
        }}
      >
        <Flex style={{ color: "var(--accent-12)" }} align="center" gap="3">
          <RocketIcon size={16} />
          <Text weight="bold">Overview</Text>
        </Flex>

        <Stats />
      </Flex>

      <WeeklyRecap />
      <OverviewContent />
    </Flex>
  );
};

const OverviewContent = () => {
  const { error, data, isFetching } = useOverView();

  if (isFetching && !data) {
    return (
      <Flex direction="column" gap="6" pt="4" pb="4">
        <Flex style={{ color: "var(--accent-12)" }} align="center" gap="3">
          <CalendarIcon size={16} />
          <Text weight="bold">Today</Text>
        </Flex>

        {[1, 2, 3, 4].map((i) => (
          <PullRequestLoading key={i} />
        ))}
      </Flex>
    );
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  if (!data) {
    return null;
  }

  return (
    <Flex direction="column" gap="6" pt="4" pb="4">
      <Flex style={{ color: "var(--accent-12)" }} align="center" gap="3">
        <CalendarIcon size={16} />
        <Text weight="bold">Today ({data.length})</Text>
      </Flex>

      <Flex direction="column" gap="6">
        {data.map(
          ({
            pr,
            reviewsAndWaitingReviews,
            actionByName,
            pullRequestUrl,
            waitingReviews,
            labels,
            assignees,
            latestFeedbackAt,
            latestMention,
          }) => {
            return (
              <Box width="100%" key={pr.id}>
                <PullRequestCard
                  pullRequest={pr}
                  waitingReviews={waitingReviews}
                  reviewsGroupedbyUser={reviewsAndWaitingReviews}
                  avatarUrl={pr?.user?.avatar_url}
                  login={pr?.user?.login}
                  title={pr.title}
                  htmlUrl={pr.html_url}
                  baseBranchName={pr.base.ref}
                  branchName={pr.head.ref}
                  repositoryName={pr.head.repo.name}
                  updatedAt={pr.updated_at}
                  latestFeedbackAt={latestFeedbackAt}
                  latestMention={latestMention}
                  actionsByName={actionByName}
                  pullRequestLink={pullRequestUrl}
                  labels={labels}
                  assignees={assignees}
                />
              </Box>
            );
          },
        )}
      </Flex>
    </Flex>
  );
};
