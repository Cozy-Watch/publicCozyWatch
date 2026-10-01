import { Spinner, Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import {
  RouterProvider,
  createHashHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { StrictMode, useEffect } from "react";
import { Appearance } from "../state/appState";
import {
  DEFAULT_ACCENT_COLOR,
  isAccentColor,
} from "../shared/theme";
import { useIsAuthenticatedQuery } from "./api/useIsAuthenticatedQuery";
import { AuthContext } from "./context/Auth/Context";
import { useAppearanceMutation } from "./pages/AppSettings/api/useAppearanceMutation";
import { useAppearanceQuery } from "./pages/AppSettings/api/useAppearanceQuery";
import {
  accentColorQueryKey,
  useAccentColorQuery,
} from "./pages/AppSettings/api/useAccentColorQuery";
import { GithubAuthentication } from "./pages/GithubAuthentication/GithubAuthentication";
import { MentionsPage } from "./pages/Mentions/MentionsPage";
import { Menubar } from "./pages/Menubar/Menubar";
import { Overview } from "./pages/Overview/Overview";
import { PullRequests } from "./pages/PullRequests/PullRequests";
import { PullRequestScopePage } from "./pages/PullRequestScope/PullRequestScopePage";
import { Repositories } from "./pages/Repositories/Repositories";
import { Root } from "./pages/Root/Root";
import { Settings } from "./pages/Settings/Settings";
import { Notifications } from "./pages/Notifications/Notifications";
import log from "electron-log/renderer";

const LoadingComponent = () => {
  return (
    <div id="loading-fallback">
      <img id="sofa" src="./images/catSitting.png" width="150" />
    </div>
  );
};

const NothingComponent = () => {
  return (
    <div>
      <img id="sofa" src="./images/catSitting.png" width="150" />
      Nothing to see here
    </div>
  );
};

interface RouterContext {
  // The ReturnType of your useAuth hook or the value of your AuthContext
  auth: {
    isAuthenticated: boolean | undefined;
  };
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => <Root />,
  errorComponent: ({ error }) => (
    <div>
      <h1>Error</h1>
      <p>{error.message}</p>
    </div>
  ),
  pendingComponent: () => LoadingComponent,
  notFoundComponent: () => NothingComponent,
});

// // --- Github Authentication Route ---
const githubAuthenticationRoute = createRoute({
  beforeLoad: async ({ context }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({
        to: "/overview",
      });
    }
  },
  getParentRoute: () => rootRoute,
  path: "/",
  component: GithubAuthentication,
});

// --- Other Routes ---
const overview = createRoute({
  getParentRoute: () => rootRoute,
  path: "/overview",
  component: Overview,
});

const pendingReviewsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "myPullRequests/pendingReviews",
  component: () => <PullRequestScopePage scope="my" filter="pendingReviews" />,
});

const reviewedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "myPullRequests/reviewed",
  component: () => <PullRequestScopePage scope="my" filter="reviewed" />,
});

const mentionsInMyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "myPullRequests/mentions",
  beforeLoad: () => {
    throw redirect({ to: "/mentions" });
  },
  component: MentionsPage,
});

const fullyApprovedInMyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "myPullRequests/fullyApproved",
  component: () => <PullRequestScopePage scope="my" filter="fullyApproved" />,
});

const pendingMyReviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "teamPullRequest/pendingReviews",
  component: () => <PullRequestScopePage scope="relevant" filter="pendingReviews" />,
});

const reviewsByMeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "teamPullRequest/reviewed",
  component: () => <PullRequestScopePage scope="relevant" filter="reviewed" />,
});

const mentionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "teamPullRequest/mentions",
  beforeLoad: () => {
    throw redirect({ to: "/mentions" });
  },
  component: MentionsPage,
});

const teamFullyApprovedInMyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "teamPullRequest/fullyApproved",
  component: () => <PullRequestScopePage scope="relevant" filter="fullyApproved" />,
});

const myPullRequestsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/myPullRequests",
  component: () => <PullRequestScopePage scope="my" filter="all" />,
});

const relevantPullRequestsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/teamPullRequest",
  component: () => <PullRequestScopePage scope="relevant" filter="all" />,
});

const mentionsPullRequestsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mentions",
  component: MentionsPage,
});

const pullRequestRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pullRequests",
  component: PullRequests,
});

const repositoriesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/repositories",
  component: Repositories,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: Settings,
});

const notificationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notifications",
  component: Notifications,
});

const menubarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/menubar",
  component: Menubar,
});

// --- Router Setup ---
const routeTree = rootRoute.addChildren([
  settingsRoute,
  notificationsRoute,
  githubAuthenticationRoute,
  pullRequestRoute,
  myPullRequestsRoute,
  relevantPullRequestsRoute,
  mentionsPullRequestsRoute,
  repositoriesRoute,
  menubarRoute,
  overview,
  pendingReviewsRoute,
  reviewedRoute,
  pendingMyReviewRoute,
  reviewsByMeRoute,
  mentionsRoute,
  mentionsInMyRoute,
  fullyApprovedInMyRoute,
  teamFullyApprovedInMyRoute,
]);

const router = createRouter({
  routeTree,
  history: createHashHistory(),
  context: {
    auth: undefined!,
  },
});

export const Router = () => {
  const { data: isAuthenticated, isPending } = useIsAuthenticatedQuery();

  if (isPending) {
    return <Spinner />;
  }

  return <RouterContent isAuthenticated={!!isAuthenticated} />;
};
const RouterContent = ({ isAuthenticated }: { isAuthenticated: boolean }) => {
  const { data: stateAppearance } = useAppearanceQuery();
  const { data: stateAccentColor } = useAccentColorQuery();
  const { mutateAsync: saveAppearance } = useAppearanceMutation();
  const queryClient = useQueryClient();

  const appearance =
    stateAppearance ??
    (window.matchMedia("(prefers-color-scheme: dark)").matches
      ? Appearance.Dark
      : Appearance.Light);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => {
      saveAppearance(event.matches ? Appearance.Dark : Appearance.Light);
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [saveAppearance]);

  useEffect(() => {
    const handler = window.electronAPI.application.onApplicationAccentColorUpdate(
      (accentColor) => {
        if (isAccentColor(accentColor)) {
          queryClient.setQueryData(accentColorQueryKey, accentColor);
        }
      },
    );

    return () => {
      window.electronAPI.application.removeOnApplicationAccentColorUpdate(
        handler,
      );
    };
  }, [queryClient]);

  useEffect(() => {
    const handleNavigateToSettings = (event: {
      route: "settings" | "signIn" | "notifications";
      notificationId?: string;
    }) => {
      const { route, notificationId } = event;
      if (route === "signIn") {
        router.navigate({ to: "/" });
      } else if (route === "notifications") {
        router.navigate({
          to: "/notifications",
          search: notificationId ? { notificationId } : {},
        });
      } else {
        router.navigate({ to: "/settings" });
      }
    };

    const handler = window.electronAPI.application.onNavigateToRoute(
      handleNavigateToSettings
    );

    const startupTime =
      (window as Window & { __APP_START?: number }).__APP_START ??
      performance.now();
    log.info(
      "[Startup] React rendered in",
      (performance.now() - startupTime).toFixed(0),
      "ms",
    );
    void window.electronAPI.application.reportRendererReady().catch((error) => {
      log.warn("[Startup] Failed to report renderer readiness", { error });
    });

    return () => {
      window.electronAPI.application.removeOnNavigateToRoute(handler);
    };
  }, []);

  return (
    <StrictMode>
      <Theme
        accentColor={stateAccentColor ?? DEFAULT_ACCENT_COLOR}
        radius={stateAccentColor === "gray" ? "small" : "large"}
        appearance={appearance}
        style={{ background: "none" }}
      >
        <AuthContext.Provider value={{ isAuthenticated: !!isAuthenticated }}>
          <RouterProvider
            router={router}
            context={{ auth: { isAuthenticated } }}
          />
        </AuthContext.Provider>
      </Theme>
    </StrictMode>
  );
};
