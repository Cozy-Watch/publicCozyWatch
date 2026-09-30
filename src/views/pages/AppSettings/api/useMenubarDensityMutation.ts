import { useMutation, useQueryClient } from "@tanstack/react-query";
import { menubarDensityQueryKey } from "./useMenubarDensityQuery";

export const useMenubarDensityMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (density: "compact" | "default") => {
      return await window.electronAPI.application.setMenubarDensity(density);
    },
    onMutate: async (density) => {
      await queryClient.cancelQueries({ queryKey: menubarDensityQueryKey });
      const previousDensity = queryClient.getQueryData<"compact" | "default">(
        menubarDensityQueryKey,
      );
      queryClient.setQueryData(menubarDensityQueryKey, density);
      return { previousDensity };
    },
    onSuccess: (density) => {
      queryClient.setQueryData(menubarDensityQueryKey, density);
    },
    onError: (_error, _density, context) => {
      if (context?.previousDensity !== undefined) {
        queryClient.setQueryData(menubarDensityQueryKey, context.previousDensity);
        return;
      }
      queryClient.removeQueries({ queryKey: menubarDensityQueryKey, exact: true });
    },
  });
};
