import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKey } from "./useOpenAtLoginQuery";

export const useOpenAtLoginMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (isChecked: boolean) => {
      return await window.electronAPI.application.setStartAtLogin(isChecked);
    },

    onMutate: async (isOpenAtLogin) => {
      await queryClient.cancelQueries({ queryKey });
      const previousValue = queryClient.getQueryData<boolean>(queryKey);
      const hadQuery = queryClient.getQueryState(queryKey) !== undefined;
      queryClient.setQueryData(queryKey, isOpenAtLogin);
      return { previousValue, hadQuery };
    },
    onSuccess: (value) => {
      queryClient.setQueryData(queryKey, value);
    },
    onError: (_error, _value, context) => {
      if (context?.hadQuery) {
        queryClient.setQueryData(queryKey, context.previousValue);
        return;
      }
      queryClient.removeQueries({ queryKey, exact: true });
    },
  });
};
