import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { NotificationRecord } from "../../mainProcess/safeStorage/safeStorage.types";

export const notificationQueryKey = ["notifications"];

export const useNotifications = () => {
  const queryClient = useQueryClient();
  const query = useQuery<NotificationRecord[]>({
    queryKey: notificationQueryKey,
    queryFn: () => window.electronAPI.application.getNotificationHistory(),
    staleTime: Infinity,
  });

  useEffect(() => {
    const handler = window.electronAPI.application.onNotificationUpdate((history) => {
      queryClient.setQueryData(notificationQueryKey, history);
    });
    return () => window.electronAPI.application.removeOnNotificationUpdate(handler);
  }, [queryClient]);

  return query;
};
