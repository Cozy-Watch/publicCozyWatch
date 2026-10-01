import { createOAuthDeviceAuth } from "@octokit/auth-oauth-device";
import { ipcMain } from "electron";
import Logger from "electron-log";
import { CLIENT_ID, GITHUB_APP_CLIENT_ID } from "../../keys";
import { getData, storeData } from "../../safeStorage/safeStorage";
import { Octokit } from "@octokit/rest";
import { tryOpenExternalUrl } from "../../security/externalUrl";
import { batchNotificationManager } from "../../notifications/notificationManager";

export const authenticateWithGitHub = async (): Promise<boolean> => {
  try {
    const auth = createOAuthDeviceAuth({
      clientType: "oauth-app",
      clientId: CLIENT_ID,
      scopes: ["repo", "notifications"],
      onVerification: ({ verification_uri, user_code }) => {
        ipcMain.emit("dispatch-authentication-auth-code", null, {
          verification_uri,
          user_code,
        });

        tryOpenExternalUrl(verification_uri);

        batchNotificationManager([{
          title: "GitHub Authentication",
          body: `Your auth code is: ${user_code}. Enter it at the opened URL.`,
          type: "system",
        }]);
      },
    });

    const { token } = await auth({ type: "oauth" });

    if (!token) {
      throw new Error("No token received");
    }

    // Store the token securely
    await storeData({ name: "access_token", data: token });
    await storeData({ name: "auth_type", data: "oauth" });

    // Important to inicialize GitHub client
    ipcMain.emit("github-token-ready");

    // Notify renderer processes about successful sign-in
    ipcMain.emit("dispatch-application-sign-user", null, true);

    return true;
  } catch (err) {
    Logger.error("Error during authentication:", err);
    return false; // Authentication failed
  }
};

export const authenticateWithPAT = async (pat: string) => {
  const octokit = new Octokit({ auth: pat });

  try {
    await octokit.request("GET /user");

    // Store the token securely
    await storeData({ name: "access_token", data: pat });
    await storeData({ name: "auth_type", data: "pat" });

    // Important to initialize GitHub client
    ipcMain.emit("github-token-ready");

    // Notify renderer processes about successful sign-in
    ipcMain.emit("dispatch-application-sign-user", null, true);

    return { valid: true, reason: "all good" };
  } catch (error: unknown) {
    const errorDetails =
      typeof error === "object" && error !== null
        ? (error as { status?: number; message?: string })
        : {};

    if (errorDetails.status === 401) {
      return {
        valid: false,
        reason: errorDetails.message || "unauthorized",
      };
    }

    return { valid: false, reason: errorDetails.message || "other-error" };
  }
};

export const authenticateWithGitHubApp = async (): Promise<boolean> => {
  try {
    const auth = createOAuthDeviceAuth({
      clientType: "github-app",
      clientId: GITHUB_APP_CLIENT_ID,
      onVerification: ({ verification_uri, user_code }) => {
        ipcMain.emit("dispatch-authentication-auth-code", null, {
          verification_uri,
          user_code,
        });

        tryOpenExternalUrl(verification_uri);

        batchNotificationManager([{
          title: "GitHub Authentication",
          body: `Your auth code is: ${user_code}. Enter it at the opened URL.`,
          type: "system",
        }]);
      },
    });

    const { token } = await auth({ type: "oauth" });

    if (!token) {
      throw new Error("No token received");
    }

    await storeData({ name: "access_token", data: token });
    await storeData({ name: "auth_type", data: "github-app" });

    ipcMain.emit("github-token-ready");
    ipcMain.emit("dispatch-application-sign-user", null, true);

    return true;
  } catch (err) {
    Logger.error("Error during GitHub App authentication:", err);
    return false;
  }
};

export const hasLocalAccessToken = async () => {
  const accessToken = await getData("access_token");
  return !!accessToken;
};
