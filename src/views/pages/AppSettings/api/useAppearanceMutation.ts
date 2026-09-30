import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Appearance, queryKey } from "./useAppearanceQuery";

export const useAppearanceMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (appearance: Appearance | null) => {
      return await window.electronAPI.application.setApplicationAppearance(
        appearance
      );
    },

    onMutate: async (appearance) => {
      await queryClient.cancelQueries({ queryKey });
      const previousAppearance = queryClient.getQueryData<Appearance | null>(queryKey);
      const hadQuery = queryClient.getQueryState(queryKey) !== undefined;
      queryClient.setQueryData(queryKey, appearance);
      return { previousAppearance, hadQuery };
    },
    onError: (_error, _appearance, context) => {
      if (context?.hadQuery) {
        queryClient.setQueryData(queryKey, context.previousAppearance);
        return;
      }
      queryClient.removeQueries({ queryKey, exact: true });
    },
  });
};
