import { useNavigate } from "@tanstack/react-router";
import Logger from "electron-log";
import { useEffect, useState } from "react";
import { useGitHubAppAuthenticationMutation } from "../../api/useGitHubAppAuthenticationMutation";
import { useGitHubAuthenticationMutation } from "../../api/useGithubAuthenticationMutation";
import { useQueryClient } from "@tanstack/react-query";

interface AuthData {
  verification_uri: string;
  user_code: string;
}

export const useAuthentication = () => {
  const [authData, setAuthData] = useState<AuthData | null>(null);

  const queryClient = useQueryClient();

  const { mutateAsync: startAuthentication } =
    useGitHubAuthenticationMutation();

  const { mutateAsync: startAppAuthentication } =
    useGitHubAppAuthenticationMutation();

  const navigate = useNavigate({ from: "/" });

  useEffect(() => {
    const handleAuthCode = (data: AuthData) => {
      setAuthData(data);
    };

    const handler =
      window.electronAPI.authentication.onAuthenticationCode(handleAuthCode);

    return () => {
      window.electronAPI.authentication.removeAuthenticationCode(handler);
    };
  }, []);

  const authenticate = async () => {
    try {
      await startAuthentication();

      queryClient.invalidateQueries();
      navigate({ to: "/settings", search: { tab: "license" } });
    } catch (err) {
      Logger.error("Error during authentication:", err);
    }
  };

  const authenticateGitHubApp = async () => {
    try {
      await startAppAuthentication();

      queryClient.invalidateQueries();
      navigate({ to: "/settings", search: { tab: "license" } });
    } catch (err) {
      Logger.error("Error during GitHub App authentication:", err);
    }
  };

  return {
    data: {
      authData,
    },
    action: {
      authenticate,
      authenticateGitHubApp,
      setAuthData,
    },
  };
};
