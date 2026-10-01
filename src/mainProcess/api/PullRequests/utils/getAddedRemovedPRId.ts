import { CacheData } from "./getDefaultData";
import { dedupePullRequests } from "./dedupePullRequests";

interface Params {
  repositoryName: string;
  initialCache: CacheData;
  finalCache: CacheData;
  userId: number;
}

export const getAddedRemovedPRId = ({
  repositoryName,
  finalCache,
  initialCache,
  userId,
}: Params) => {
  const allInitial = dedupePullRequests(
    Object.values(initialCache.pullRequestsPerRepo[repositoryName] || {}).flat(),
  );
  const initial = allInitial.filter(
    (pr) =>
      pr?.user?.id === userId ||
      pr?.assignees?.some((assignee) => assignee.id === userId) ||
      pr?.requested_reviewers?.some((reviewer) => reviewer.id === userId)
  );

  const initialIds = new Set(initial.map((pr) => pr.id));

  const allFinal = dedupePullRequests(
    Object.values(finalCache.pullRequestsPerRepo[repositoryName] || {}).flat(),
  );

  const final = allFinal.filter(
    (pr) =>
      pr?.user?.id === userId ||
      pr?.assignees?.some((assignee) => assignee.id === userId) ||
      pr?.requested_reviewers?.some((reviewer) => reviewer.id === userId)
  );

  const finalIds = new Set(final.map((pr) => pr.id));

  const removed = [...initialIds].filter((id) => !finalIds.has(id));
  const added = [...finalIds].filter((id) => !initialIds.has(id));

  return { added, removed };
};
