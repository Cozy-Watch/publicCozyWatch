import { useMemo } from "react";
import { useRepositoriesQuery } from "../../api/useRepositoriesQuery";
import { usePullRequestQuery } from "../../api/usePullRequestQuery";
import { dedupePullRequests } from "../../../mainProcess/api/PullRequests/utils/dedupePullRequests";

export const usePullRequests = () => {
  const pullRequestsQueryInfo = usePullRequestQuery();
  const repositoriesQueryInfo = useRepositoriesQuery();

  const data = useMemo(() => {
    if (!pullRequestsQueryInfo.data || !repositoriesQueryInfo.data) {
      return null;
    }

    const { pullRequestsPerRepo, actionsPerRepo, reviewPerRepoPerPullNumber } =
      pullRequestsQueryInfo.data;

    const { repositories, activeRepositories } = repositoriesQueryInfo.data;

    const onlyActiveRepositories = repositories.filter(({ id }) => {
      return activeRepositories[id];
    });

    const activeRepositoriesWithPullReques = onlyActiveRepositories.map(
      (repository) => {
        const { name: repoName } = repository;

        const prData = dedupePullRequests(
          Object.values(pullRequestsPerRepo[repoName] || {}).flat(),
        );

        type WorkflowRun = NonNullable<typeof actionsPerRepo[string]>[number];
        const groupWorkflows = (actionsPerRepo[repoName] ?? []).reduce(
          (acc: Record<number, WorkflowRun[]>, action) => ({
            ...acc,
            [action.workflow_id]: [...(acc[action.workflow_id] ?? []), action],
          }),
          {}
        );

        const pullRequests = prData.map((pr) => {
          const actions = Object.values(groupWorkflows).map((action) => {
            const pullRequestAction = action.find(({ pull_requests }) =>
              pull_requests?.some(({ number }) => pr.number === number)
            );

            return {
              id: pullRequestAction?.id || pullRequestAction?.name,
              status: pullRequestAction?.status,
              conclusion: pullRequestAction?.conclusion,
              name: pullRequestAction?.name,
              html_url: pullRequestAction?.html_url,
            };
          });

          const groupCommentsByUser = (
            reviewPerRepoPerPullNumber[repoName]?.[pr.number] ?? []
          ).reduce((acc: Record<string, unknown>, comment) => {
            return {
              ...acc,
              [comment.user?.login || "unknown"]: comment,
            };
          }, {});

          const comments = Object.keys(groupCommentsByUser || {}).map(
            (userLogin) => {
              return reviewPerRepoPerPullNumber[repoName]?.[pr.number].find(
                ({ user }) => user?.login === userLogin
              );
            }
          );

          return {
            ...pr,
            actions: actions,
            comments: comments,
          };
        });

        return {
          repositoryName: repoName,
          repositoryData: repository,
          pullRequests,
        };
      }
    );

    return {
      activeRepositoriesWithPullReques,
      countRepositories: repositories.length,
      countActiveRepositories: Object.values(activeRepositories).filter(
        (value) => value
      ).length,
    };
  }, [pullRequestsQueryInfo.data, repositoriesQueryInfo.data]);

  return {
    ...pullRequestsQueryInfo,
    ...repositoriesQueryInfo,
    isPending:
      pullRequestsQueryInfo.isPending || repositoriesQueryInfo.isPending,
    error: pullRequestsQueryInfo.error || repositoriesQueryInfo.error,
    data,
  };
};
