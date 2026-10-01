import { useMutation, useQueryClient } from "@tanstack/react-query";
import { NotificationSettingsPerKey } from "src/mainProcess/safeStorage/safeStorage.types";
import { queryKey } from "./useNotificationsQuery";

export const useToggleAllNotificationsMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (enable: boolean) => {
      return await window.electronAPI.application.setToggleAllNotifications(
        enable
      );
    },

    onMutate: async (enable) => {
      await queryClient.cancelQueries({ queryKey });
      const previousNotifications =
        queryClient.getQueryData<NotificationSettingsPerKey>(queryKey);
      if (previousNotifications) {
        queryClient.setQueryData(
          queryKey,
          Object.fromEntries(
            Object.entries(previousNotifications).map(([key, notification]) => [
              key,
              { ...notification, value: enable },
            ]),
          ) as NotificationSettingsPerKey,
        );
      }
      return { previousNotifications };
    },
    onSuccess: (notifications) => {
      queryClient.setQueryData(queryKey, notifications);
    },
    onError: (_error, _enable, context) => {
      if (context?.previousNotifications) {
        queryClient.setQueryData(queryKey, context.previousNotifications);
      }
    },
  });
};
