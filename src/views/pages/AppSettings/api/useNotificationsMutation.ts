import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  NotificationKey,
  NotificationSettingsPerKey,
} from "src/mainProcess/safeStorage/safeStorage.types";
import { queryKey } from "./useNotificationsQuery";

export const useNotificationsMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ checked, key }: { checked: boolean; key: string }) => {
      return await window.electronAPI.application.setNotificationSetting({
        checked,
        key,
      });
    },
    onMutate: async ({ checked, key }) => {
      await queryClient.cancelQueries({ queryKey });
      const previousNotifications =
        queryClient.getQueryData<NotificationSettingsPerKey>(queryKey);
      const notificationKey = key as NotificationKey;
      if (previousNotifications?.[notificationKey]) {
        queryClient.setQueryData(queryKey, {
          ...previousNotifications,
          [notificationKey]: {
            ...previousNotifications[notificationKey],
            value: checked,
          },
        });
      }
      return { previousNotifications };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousNotifications) {
        queryClient.setQueryData(queryKey, context.previousNotifications);
      }
    },
  });
};
