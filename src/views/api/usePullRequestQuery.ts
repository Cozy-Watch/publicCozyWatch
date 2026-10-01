import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { CacheData as PullRequestData } from "src/mainProcess/api/PullRequests/utils/getDefaultData";

export const queryKey = ["pullRequests"];

let latestPushedPullRequestData: PullRequestData | undefined;
let pushedUpdateSequence = 0;

export const usePullRequestQuery = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleUpdate = (data: PullRequestData) => {
      latestPushedPullRequestData = data;
      pushedUpdateSequence += 1;
      queryClient.setQueryData(queryKey, (oldData: PullRequestData) => {
        if (!oldData) {
          return data;
        }

        return {
          ...oldData,
          ...data,
        };
      });
    };

    const handler = window.electronAPI.pullRequest.onUpdate(handleUpdate);

    return () => {
      window.electronAPI.pullRequest.removeOnUpdate(handler);
    };
  }, []);

  return useQuery<PullRequestData>({
    staleTime: Infinity,
    queryKey: queryKey,
    queryFn: async () => {
      const updateSequenceAtStart = pushedUpdateSequence;
      const response = await window.electronAPI.pullRequest.query();

      // A background update can arrive while the initial snapshot IPC is pending.
      // Keep that newer push instead of replacing it with the earlier snapshot.
      return pushedUpdateSequence > updateSequenceAtStart &&
        latestPushedPullRequestData
        ? latestPushedPullRequestData
        : response;
    },
  });
};
