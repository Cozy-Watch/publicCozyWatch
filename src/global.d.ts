import type { IpcRendererEvent } from "electron";
import { CacheData as PullRequestDTO } from "./mainProcess/api/PullRequests/utils/getDefaultData";
import {
  RepositoriesCache,
  User,
  Appearance,
  NotificationSettingsPerKey,
  NotificationRecord,
} from "./mainProcess/safeStorage/safeStorage.types";
import {
  LicenseState,
  LicenseUsage,
} from "./mainProcess/licensing/licenseState.types";
import type { AccentColor } from "./shared/theme";
import type { PersonalWeeklyRecap } from "./weeklyRecap/types";
import type {
  MergeOptions,
  MergePullRequestInput,
  MergeResult,
  MergeStatusInput,
  MergeStatusResult,
  PullRequestIdentity,
} from "./mainProcess/api/PullRequests/mergePullRequest.types";

export {};

type GetRepositories = Omit<RepositoriesCache, "lastFetched">;
type IpcListener<T> = (event: IpcRendererEvent, data: T) => void;
type AuthenticationCode = {
  verification_uri: string;
  user_code: string;
};

declare global {
  const __COZYWATCH_OFFICIAL_BUILD__: boolean;
  const __COZYWATCH_DIAGNOSTICS_BUILD__: boolean;

  interface Window {
    electronAPI: {
      application: {
        setApplicationAppearance: (
          appearance: Appearance | null,
        ) => Promise<Appearance | null>;
        getApplicationAppearance: () => Promise<Appearance | null>;
        setApplicationAccentColor: (
          accentColor: AccentColor,
        ) => Promise<AccentColor>;
        getApplicationAccentColor: () => Promise<AccentColor>;
        getVersion: () => Promise<string>;

        // Menubar Density
        getMenubarDensity: () => Promise<"compact" | "default">;
        setMenubarDensity: (
          density: "compact" | "default",
        ) => Promise<"compact" | "default">;

        onApplicationAppearanceUpdate: (
          callback: (data: Appearance) => void,
        ) => IpcListener<Appearance>;
        removeOnApplicationAppearanceUpdate: (
          callback: IpcListener<Appearance>,
        ) => void;
        onApplicationAccentColorUpdate: (
          callback: (data: AccentColor) => void,
        ) => IpcListener<AccentColor>;
        removeOnApplicationAccentColorUpdate: (
          callback: IpcListener<AccentColor>,
        ) => void;

        onSignOut: (callback: (data: boolean) => void) => IpcListener<boolean>;
        removeOnSignOut: (callback: IpcListener<boolean>) => void;

        signUser: (status: boolean) => void;
        onSignUser: (
          callback: (status: boolean) => void,
        ) => IpcListener<boolean>;
        removeOnSignUser: (handler: IpcListener<boolean>) => void;

        getNotificationsSettings: () => Promise<NotificationSettingsPerKey>;
        setToggleAllNotifications: (
          enabled: boolean,
        ) => Promise<NotificationSettingsPerKey>;
        setNotificationSetting: ({
          checked,
          key,
        }: {
          checked: boolean;
          key: string;
        }) => Promise<NotificationSettingsPerKey>;
        getNotificationHistory: () => Promise<NotificationRecord[]>;
        markNotificationRead: (id: string) => Promise<void>;
        markAllNotificationsRead: () => Promise<void>;
        clearNotificationHistory: () => Promise<void>;
        onNotificationUpdate: (
          callback: (data: NotificationRecord[]) => void,
        ) => IpcListener<NotificationRecord[]>;
        removeOnNotificationUpdate: (
          callback: IpcListener<NotificationRecord[]>,
        ) => void;

        getStartAtLogin: () => Promise<boolean>;
        setStartAtLogin: (isOpenAtLogin: boolean) => Promise<boolean>;

        refreshPoll: () => Promise<void>;

        getDiagnosticsStatus: () => Promise<{ enabled: boolean }>;
        exportDiagnosticsBundle: () => Promise<{ saved: boolean }>;
        reportRendererReady: () => Promise<void>;

        navigateToRoute: (route: "settings" | "signIn" | "notifications") => void;
        onNavigateToRoute: (
          callback: (event: {
            route: "settings" | "signIn" | "notifications";
            notificationId?: string;
          }) => void,
        ) => IpcListener<{
          route: "settings" | "signIn" | "notifications";
          notificationId?: string;
        }>;
        removeOnNavigateToRoute: (
          callback: IpcListener<{
            route: "settings" | "signIn" | "notifications";
            notificationId?: string;
          }>,
        ) => void;
      };

      // Security Storage
      deleteAllData: () => void;

      authentication: {
        isStored: () => Promise<boolean>;
        authenticateGitHub: () => Promise<boolean>;
        authenticateGitHubApp: () => Promise<boolean>;
        storePAT: (token: string) => Promise<{
          success: boolean;
          reason?: string;
          isRemoteValidation?: boolean;
        }>;
        onAuthenticationCode: (
          callback: (data: AuthenticationCode) => void,
        ) => IpcListener<AuthenticationCode>;
        removeAuthenticationCode: (
          callback: IpcListener<AuthenticationCode>,
        ) => void;
        getUser: () => Promise<User>;

        onInvalidPATaccess: (
          callback: (message: string) => void,
        ) => IpcListener<string>;
        removeOnInvalidPATaccess: (callback: IpcListener<string>) => void;
      };

      repository: {
        query: () => Promise<GetRepositories>;
        onUpdate: (
          callback: (data: RepositoriesCache) => void,
        ) => IpcListener<RepositoriesCache>;
        removeOnUpdate: (callback: IpcListener<RepositoriesCache>) => void;
        setEnableState: (
          activeRepositories: Record<number, boolean>,
        ) => Promise<unknown>;
      };

      pullRequest: {
        query: () => Promise<PullRequestDTO>;
        onUpdate: (
          callback: (data: PullRequestDTO) => void,
        ) => IpcListener<PullRequestDTO>;
        removeOnUpdate: (callback: IpcListener<PullRequestDTO>) => void;
        getMergeOptions: (
          identity: PullRequestIdentity,
        ) => Promise<MergeOptions | MergeResult>;
        merge: (input: MergePullRequestInput) => Promise<MergeResult>;
        getMergeStatus: (input: MergeStatusInput) => Promise<MergeStatusResult>;
      };

      weeklyRecap: {
        personal: (weekStart: string) => Promise<PersonalWeeklyRecap>;
      };

      // License Key
      license: {
        activate: (licenseKey: string) => Promise<LicenseState>;
        getStatus: () => Promise<LicenseState>;
        validate: () => Promise<LicenseState>;
        setUsage: (usage: LicenseUsage) => Promise<LicenseState>;
        deactivate: () => Promise<LicenseState>;
        markExpiryReminderShown: () => Promise<LicenseState>;
      };

      // Open external URL
      openExternalLink: (url: string) => Promise<void>;
      // Copy to Clipboard
      copyToClipboard: (text: string) => void;
    };
  }
}

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
