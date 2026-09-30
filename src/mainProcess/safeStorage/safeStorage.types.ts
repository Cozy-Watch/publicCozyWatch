import { CacheData as PullRequestCache } from "../api/PullRequests/utils/getDefaultData";
import type { LicenseState } from "../licensing/licenseState.types";
import type { AccentColor } from "../../shared/theme";

// ------------
// REPOSITORIES
export interface Repository {
  name: string;
  url: string;
  description: string | null;
  owner: string;
  id: number;
  htmlUrl: string;
  avatar: string;
}

export interface RepositoriesCache {
  etagPerPage?: Record<string, string>;
  repositoriesByPage?: Record<string, Repository[]>;
  activeRepositories?: Record<number, boolean>;
}
// ------------
// END REPOSITORIES

export interface User {
  login: string;
  avatarUrl: string;
  company: string | null;
  name: string | null;
  id: number;
}

export enum Appearance {
  Light = "light",
  Dark = "dark",
}

export interface NotificationSetting {
  title: string;
  description: string;
  value: boolean;
}

export type NotificationType =
  | "pullRequest"
  | "review"
  | "ci"
  | "mention"
  | "system";

export type NotificationTone = "success" | "danger" | "neutral";

export interface NotificationRecord {
  id: string;
  type: NotificationType;
  tone?: NotificationTone;
  title: string;
  body: string;
  createdAt: string;
  url?: string;
  source?: {
    repository?: string;
    pullNumber?: number;
    branch?: string;
  };
  read: boolean;
}

export const NOTIFICATION_KEYS = [
  "pullRequestsAddedNotification",
  "pullRequestsRemovedNotification",
  "newReviewsNotification",
  "reviewsUpdateNotification",
  "ciStatusNotification",
  "mentionsNotification",
] as const;

export type NotificationKey = (typeof NOTIFICATION_KEYS)[number];

export type NotificationSettingsPerKey = Record<
  NotificationKey,
  NotificationSetting
>;

export type StoreDataParams<T extends keyof StoreDataMap> = {
  name: T;
  data: StoreDataMap[T];
};

export type AuthType = "pat" | "oauth" | "github-app";

export type StoreDataMap = {
  access_token: string | null;
  active_repositories: Record<number, boolean>;
  auth_type: AuthType | null;
  appearance?: Appearance | null;
  accentColor?: AccentColor;
  licenseKey: string;
  licenseState: LicenseState;
  pull_requests_cache: PullRequestCache | null;
  repositories_cache: RepositoriesCache | null;
  user: User | null;
  notifications: NotificationSettingsPerKey;
  notification_history: NotificationRecord[];
  open_at_login: boolean;
  appSettings: {
    menubarDensity: "compact" | "default";
  };
};

export type StoreDataName = keyof StoreDataMap;
