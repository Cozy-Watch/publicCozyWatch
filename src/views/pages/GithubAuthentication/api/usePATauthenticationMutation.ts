import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import Logger from "electron-log";

export const usePATauthenticationMutation = () => {
  const queryClient = useQueryClient();

  const navigate = useNavigate({ from: "/" });

  return useMutation({
    mutationFn: async (value: string) => {
      try {
        const response =
          await window.electronAPI.authentication.storePAT(value);

        if (!response.success) {
          throw new Error(response.reason || "Failed to store PAT");
        }

        return response;
      } catch (err) {
        Logger.error("storePAT failed:", err);
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries();

      navigate({ to: "/settings", search: { tab: "license" } });
    },
  });
};
