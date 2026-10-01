import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AccentColor } from "../../../../shared/theme";
import { accentColorQueryKey } from "./useAccentColorQuery";

export const useAccentColorMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (accentColor: AccentColor) =>
      window.electronAPI.application.setApplicationAccentColor(accentColor),
    onMutate: async (accentColor) => {
      await queryClient.cancelQueries({ queryKey: accentColorQueryKey });
      const previousAccentColor = queryClient.getQueryData<AccentColor>(
        accentColorQueryKey,
      );
      queryClient.setQueryData(accentColorQueryKey, accentColor);
      return { previousAccentColor };
    },
    onError: (_error, _accentColor, context) => {
      if (context?.previousAccentColor) {
        queryClient.setQueryData(
          accentColorQueryKey,
          context.previousAccentColor,
        );
      }
    },
    onSuccess: (accentColor) => {
      queryClient.setQueryData(accentColorQueryKey, accentColor);
    },
  });
};
