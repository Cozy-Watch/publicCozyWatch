import { Menu, nativeImage, Tray } from "electron";
import path from "node:path";
import { createWindow, getMainWindow } from "../../main";
import { getCachedData as getPullRequestsCache } from "../api/PullRequests/utils/getDefaultData";
import { dedupePullRequests } from "../api/PullRequests/utils/dedupePullRequests";
import { getCachedData as getRepositoriesCache } from "../api/Repositories/utils/getDefaultData";
import { getUser } from "../api/User/getUser";
import { tryOpenExternalUrl } from "../security/externalUrl";
import type {
  PullListReview,
  PullRequestList,
  PullsActions,
} from "../api/PullRequests/utils/getDefaultData";

let tray: Tray | null = null;

const DEFAULT_MENU: Electron.MenuItemConstructorOptions[] = [
  { type: "separator" },
  {
    label: "Setting",
    click() {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.show();
      } else {
        createWindow();
      }
    },
  },
  {
    label: "Quit",
    role: "quit",
  },
];

export const createTray = async () => {
  if (tray) {
    return;
  }

  const trayIcon = nativeImage.createFromPath(
    path.join(__dirname, `images/trayIcon.png`)
  );
  tray = new Tray(trayIcon);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "👀 Your Pull Requests will show here" },
      ...DEFAULT_MENU,
    ])
  );

  tray.setToolTip("Check your pull requests");
};

type ListOfStatus = "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED";

// Caches composed icon images — there are only a handful of possible status
// combinations so this stays tiny while avoiding repeated pixel-buffer work.
const iconCache = new Map<string, Electron.NativeImage>();

const getIcon = (listOfStatus: ListOfStatus[]): Electron.NativeImage => {
  const key = [...listOfStatus].sort().join(",");
  if (iconCache.has(key)) return iconCache.get(key)!;

  const statusStyles: Record<ListOfStatus, { color: string; symbol: string }> = {
    APPROVED: { color: "#2da44e", symbol: "✓" },
    CHANGES_REQUESTED: { color: "#cf222e", symbol: "!" },
    COMMENTED: { color: "#8250df", symbol: "…" },
    DISMISSED: { color: "#8250df", symbol: "…" },
  };

  const createStatusIcon = (status: ListOfStatus) => {
    const { color, symbol } = statusStyles[status];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="${color}"/><text x="16" y="22" text-anchor="middle" font-family="sans-serif" font-size="20" font-weight="700" fill="#fff">${symbol}</text></svg>`;
    return nativeImage.createFromDataURL(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    );
  };

  const icons1x = listOfStatus.map(createStatusIcon);
  const icons2x = listOfStatus.map(createStatusIcon);

  if (icons1x.length === 0) {
    const empty = nativeImage.createEmpty();
    iconCache.set(key, empty);
    return empty;
  }

  // Margin between icons
  const margin1x = 4;
  const iconSize1x = 16;
  const width1x = icons1x.length * iconSize1x + (icons1x.length - 1) * margin1x;
  const height1x = iconSize1x;
  const canvas1x = Buffer.alloc(width1x * height1x * 4);
  let xOffset = 0;
  for (const icon of icons1x) {
    const iconBuffer = icon
      .resize({ width: iconSize1x, height: iconSize1x })
      .toBitmap();
    for (let y = 0; y < iconSize1x; y++) {
      for (let x = 0; x < iconSize1x; x++) {
        const srcIndex = (y * iconSize1x + x) * 4;
        const destIndex = (y * width1x + x + xOffset) * 4;
        canvas1x[destIndex] = iconBuffer[srcIndex];
        canvas1x[destIndex + 1] = iconBuffer[srcIndex + 1];
        canvas1x[destIndex + 2] = iconBuffer[srcIndex + 2];
        canvas1x[destIndex + 3] = iconBuffer[srcIndex + 3];
      }
    }
    xOffset += iconSize1x + margin1x;
  }
  const image1x = nativeImage.createFromBuffer(canvas1x, {
    width: width1x,
    height: height1x,
  });

  // Compose 2x
  let image2x: Electron.NativeImage | undefined;
  if (icons2x.length === icons1x.length) {
    const margin2x = 8;
    const iconSize2x = 32;
    const width2x =
      icons2x.length * iconSize2x + (icons2x.length - 1) * margin2x;
    const height2x = iconSize2x;
    const canvas2x = Buffer.alloc(width2x * height2x * 4);
    let xOffset2x = 0;
    for (const icon of icons2x) {
      const iconBuffer = icon
        .resize({ width: iconSize2x, height: iconSize2x })
        .toBitmap();
      for (let y = 0; y < iconSize2x; y++) {
        for (let x = 0; x < iconSize2x; x++) {
          const srcIndex = (y * iconSize2x + x) * 4;
          const destIndex = (y * width2x + x + xOffset2x) * 4;
          canvas2x[destIndex] = iconBuffer[srcIndex];
          canvas2x[destIndex + 1] = iconBuffer[srcIndex + 1];
          canvas2x[destIndex + 2] = iconBuffer[srcIndex + 2];
          canvas2x[destIndex + 3] = iconBuffer[srcIndex + 3];
        }
      }
      xOffset2x += iconSize2x + margin2x;
    }
    image2x = nativeImage.createFromBuffer(canvas2x, {
      width: width2x,
      height: height2x,
    });
  }

  const finalImage = nativeImage.createEmpty();
  finalImage.addRepresentation({
    scaleFactor: 1,
    buffer: image1x.toPNG(),
    width: width1x,
    height: height1x,
  });
  if (image2x) {
    finalImage.addRepresentation({
      scaleFactor: 2,
      buffer: image2x.toPNG(),
      width: image2x.getSize().width,
      height: image2x.getSize().height,
    });
  }

  iconCache.set(key, finalImage);
  return finalImage;
};

// Shared helper — builds menu items for a list of PRs given pre-computed
// reviews and workflow groups (both computed once per repo, not per PR).
const buildPRMenuItems = (
  pullRequests: PullRequestList,
  reviews: Record<string, PullListReview> | undefined,
  groupWorkflows: Record<number, PullsActions>
): Electron.MenuItemConstructorOptions[] => {
  return pullRequests.map((pullRequest) => {
    if (!reviews) {
      return {
        label: pullRequest.title,
        click: () => tryOpenExternalUrl(pullRequest.html_url),
      };
    }

    const reviewsForPR = reviews[pullRequest.number] || [];

    const users = reviewsForPR.reduce((acc: Record<number, number>, review) => {
      if (review?.user?.id) {
        return { ...acc, [review.user.id]: review.user.id };
      }
      return acc;
    }, {});

    const latestStatusPerUser = Object.values(users).map((uid) => {
      const userReviews = reviewsForPR.filter((r) => r?.user?.id === uid);
      return userReviews[userReviews.length - 1]?.state as ListOfStatus;
    });

    const getPullRequestAction = Object.values(groupWorkflows).map((actions) => {
      const match = actions.find((action) => action.head_sha === pullRequest.head.sha);
      return {
        status: match?.status,
        conclusion: match?.conclusion,
        name: match?.name,
        html_url: match?.html_url,
      };
    });

    const iconType = getIcon(latestStatusPerUser);

    const submenu = getPullRequestAction.map((ci) => ({
      label: `${ci.name || "CI"}: ${ci.status}${ci.conclusion ? ` (${ci.conclusion})` : ""}`,
      toolTip: ci.html_url || "",
      icon: getIcon(ci.conclusion === "failure" ? ["CHANGES_REQUESTED"] : ["APPROVED"]),
      click: () => tryOpenExternalUrl(pullRequest.html_url),
    }));

    return {
      label: pullRequest.title,
      icon: iconType,
      click: () => tryOpenExternalUrl(pullRequest.html_url),
      ...(submenu.length === 0
        ? undefined
        : { submenu: [{ label: "CI Status:" }, ...submenu] }),
    };
  });
};

export const updateTrayMenu = async () => {
  if (!tray) {
    return;
  }

  const { id: userId } = await getUser();
  const pullRequestCache = await getPullRequestsCache();
  const { repositoriesByPage, activeRepositories } =
    await getRepositoriesCache();

  const onlyActiveRepositories = Object.values(repositoriesByPage)
    .flat()
    .filter(({ id }) => activeRepositories[id]);

  const { pullRequestsPerRepo, reviewPerRepoPerPullNumber, actionsPerRepo } =
    pullRequestCache;

  const menuItems = onlyActiveRepositories.reduce(
    (acc, { name: repoName }) => {
      const reviews = reviewPerRepoPerPullNumber[repoName];

      const pullRequestInfoList = dedupePullRequests(
        Object.values(pullRequestsPerRepo[repoName] || {}).flat(),
      )
        .filter(
          (pr) =>
            pr?.user?.id === userId ||
            pr?.assignees?.some((assignee) => assignee.id === userId) ||
            pr?.requested_reviewers?.some((reviewer) => reviewer.id === userId)
        );

      const parsed = pullRequestInfoList.reduce<{
        user: PullRequestList;
        rest: PullRequestList;
      }>(
        (acc, pr) => {
          if (pr.user?.id === userId) {
            return { ...acc, user: [...acc.user, pr] };
          }
          return { ...acc, rest: [...acc.rest, pr] };
        },
        { user: [], rest: [] }
      );

      // Build workflow groups once per repo, reused by all PRs below.
      const groupWorkflows = (actionsPerRepo[repoName] || []).reduce<
        Record<number, PullsActions>
      >(
        (acc, action) => ({
          ...acc,
          [action.workflow_id]: [...(acc[action.workflow_id] || []), action],
        }),
        {}
      );

      return {
        ...acc,
        user: [...acc.user, buildPRMenuItems(parsed.user, reviews, groupWorkflows)],
        rest: [...acc.rest, buildPRMenuItems(parsed.rest, reviews, groupWorkflows)],
      };
    },
    {
      user: [] as Electron.MenuItemConstructorOptions[][],
      rest: [] as Electron.MenuItemConstructorOptions[][],
    }
  );

  const userMenu = menuItems.user.flat();
  const restMenu = menuItems.rest.flat();

  tray.setContextMenu(
    Menu.buildFromTemplate([
      ...(userMenu.length > 0
        ? [{ label: "-- Your Pull Requests --" }, ...userMenu]
        : []),
      ...(restMenu.length > 0
        ? [{ label: "-- Assigned to you --" }, ...restMenu]
        : []),
      ...DEFAULT_MENU,
    ])
  );
};
