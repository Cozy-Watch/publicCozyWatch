import { ipcMain } from "electron";
import { Octokit as OctokitCore } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";
import {
  deleteData,
  deleteDataOrThrow,
  getData,
} from "../safeStorage/safeStorage";
import { AuthType } from "../safeStorage/safeStorage.types";
import Logger from "electron-log";
import { refreshCoordinator } from "../polling/refreshCoordinator";
import { setLocalCache as setPullCache } from "./PullRequests/utils/getDefaultData";
import { setLocalCache as setRepositoryCache } from "./Repositories/utils/getDefaultData";

// Compose Octokit with the throttling plugin
const Octokit = OctokitCore.plugin(throttling);

const getSafeErrorMetadata = (error: unknown) => ({
  name: error instanceof Error ? error.name : "UnknownError",
  status:
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : undefined,
});

let octokitInstance: Promise<InstanceType<typeof Octokit>> | null = null;

let currentAuthType: AuthType | null = null;

export const setAuthType = (type: AuthType | null) => {
  currentAuthType = type;
};

export const getAuthType = (): AuthType | null => currentAuthType;

/** Returns true only when the user is authenticated via a Personal Access Token */
export const isPATAuth = (): boolean => currentAuthType === "pat";

/**
 * Initializes Octokit with the stored access token.
 * Ensures only one instance is created.
 * Waits for IPC "github-token-ready" if no token is found in storage.
 */
export async function initGithubClient(): Promise<
  InstanceType<typeof Octokit>
> {
  if (!octokitInstance) {
    octokitInstance = (async () => {
      try {
        Logger.info("[Octokit] initGithubClient start");

        let accessToken = await getData("access_token");
        Logger.info(`[Octokit] accessToken present!`);

        // Load auth type from storage so 403 handlers can detect PAT vs GitHub App
        const storedAuthType = await getData("auth_type");
        currentAuthType = storedAuthType ?? null;

        // Validate token if present
        if (accessToken && !(await validateToken(accessToken))) {
          Logger.warn("[Octokit] Token invalid, clearing stored token");
          await deleteData("access_token");
          accessToken = null;
        }

        if (!accessToken) {
          Logger.warn(
            "[Octokit] No access token found, waiting for github-token-ready event...",
          );
          await new Promise<void>((resolve) => {
            const handler = () => {
              Logger.info(
                "[Octokit] github-token-ready received, retrying getData",
              );
              resolve();
              ipcMain.removeListener("github-token-ready", handler);
            };
            ipcMain.on("github-token-ready", handler);
          });

          // Retry getting the token
          accessToken = await getData("access_token");
          Logger.info("[Octokit] access token refreshed", {
            present: Boolean(accessToken),
          });
        }

        Logger.info("[Octokit] Creating Octokit instance with throttling...");
        const client = new Octokit({
          auth: accessToken,
          throttle: {
            onRateLimit: (retryAfter, options) => {
              Logger.warn(
                `Primary rate limit exceeded for request ${options.method} ${options.url}`,
              );
              return options.request.retryCount === 0;
            },
            onSecondaryRateLimit: (retryAfter, options) => {
              Logger.warn(
                `Secondary rate limit detected for request ${options.method} ${options.url}`,
              );
              return options.request.retryCount === 0;
            },
          },
        });

        // Hook into request errors to handle 401 Bad Credentials globally
        client.hook.error("request", async (error) => {
          const status = "status" in error ? error.status : undefined;

          if (
            status === 401 ||
            (error.message && error.message.includes("Bad credentials"))
          ) {
            Logger.warn(
              "[Octokit] Authentication error detected, signing out user",
            );
            octokitInstance = null;
            await signOut();
            throw new Error("Authentication failed. User has been signed out.");
          }
          throw error;
        });

        Logger.info("[Octokit] Octokit instance created successfully");
        return client;
      } catch (error) {
        Logger.error(
          "Failed to initGithubClient",
          getSafeErrorMetadata(error),
        );
        octokitInstance = null; // Reset so future calls can retry authentication
        throw error;
      }
    })();
  } else {
    Logger.info(
      "[Octokit] octokitInstance already exists, returning existing instance",
    );
  }

  return octokitInstance;
}

/**
 * Returns an initialized Octokit instance, ensuring it's available.
 */
export async function getOctokit(): Promise<InstanceType<typeof Octokit>> {
  Logger.info("[Octokit] getOctokit start");
  return octokitInstance ?? initGithubClient();
}

/**
 * Wrapper function to get GitHub client with additional error handling.
 */
export const getGithubClient = async (): Promise<
  InstanceType<typeof Octokit>
> => {
  try {
    Logger.info("[Octokit] getGithubClient called");
    const client = await getOctokit();
    Logger.info("[Octokit] getGithubClient success, client obtained");
    return client;
  } catch (err) {
    Logger.error(
      "[Octokit] Error getting Octokit",
      getSafeErrorMetadata(err),
    );
    throw new Error("Octokit is not initialized.", { cause: err });
  }
};

export const createGithubClient = async () => {
  Logger.info(`[Octokit] createGithubClient for created`);

  let accessToken = await getData("access_token");

  if (accessToken) {
    Logger.info(`[Octokit] accessToken present!`);
  }

  if (!accessToken) {
    Logger.warn(
      "[Octokit] No access token found, waiting for github-token-ready event...",
    );
    await new Promise<void>((resolve) => {
      const handler = () => {
        Logger.info("[Octokit] github-token-ready received, retrying getData");
        resolve();
        ipcMain.removeListener("github-token-ready", handler);
      };
      ipcMain.on("github-token-ready", handler);
    });

    // Retry getting the token
    accessToken = await getData("access_token");
    Logger.info("[Octokit] access token refreshed", {
      present: Boolean(accessToken),
    });
  }

  const client = new Octokit({
    auth: accessToken,
    throttle: {
      onRateLimit: (retryAfter, options) => {
        Logger.warn(
          `Primary rate limit exceeded for request ${options.method} ${options.url}`,
        );
        return options.request.retryCount === 0;
      },
      onSecondaryRateLimit: (retryAfter, options) => {
        Logger.warn(
          `Secondary rate limit detected for request ${options.method} ${options.url}`,
        );
        return options.request.retryCount === 0;
      },
    },
  });

  Logger.info("[Octokit] Custom Octokit instance created");
  return client;
};

/**
 * Clears all stored data and resets the Octokit instance.
 */
export const signOut = async () => {
  refreshCoordinator.invalidate();
  setPullCache(null);
  setRepositoryCache(null);
  try {
    Logger.info("[Octokit] Signing out...");
    await Promise.all([
      deleteDataOrThrow("active_repositories"),
      deleteDataOrThrow("auth_type"),
      deleteDataOrThrow("pull_requests_cache"),
      deleteDataOrThrow("repositories_cache"),
      deleteDataOrThrow("user"),
    ]);
    await deleteDataOrThrow("access_token");

    octokitInstance = null;
    Logger.info("[Octokit] Sign out completed, instance reset");
    return true;
  } catch (error) {
    Logger.error(
      "[Octokit] Error signing out",
      getSafeErrorMetadata(error),
    );
    return false;
  }
};

// Add this function to validate token before use
async function validateToken(token: string): Promise<boolean> {
  try {
    const tempClient = new Octokit({
      auth: token,
      throttle: {
        onRateLimit: (retryAfter, options) => {
          Logger.warn(
            `Validation: Rate limit exceeded for ${options.method} ${options.url}`,
          );
          return options.request.retryCount === 0;
        },
        onSecondaryRateLimit: (retryAfter, options) => {
          Logger.warn(
            `Validation: Secondary rate limit for ${options.method} ${options.url}`,
          );
          return options.request.retryCount === 0;
        },
      },
    });

    await tempClient.users.getAuthenticated();
    return true;
  } catch (error) {
    Logger.error(
      "[Octokit] Token validation failed",
      getSafeErrorMetadata(error),
    );
    return false;
  }
}
