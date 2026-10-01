import { app, Menu, MenuItemConstructorOptions, shell } from "electron";
import { batchNotificationManager } from "../notifications/notificationManager";
import { deleteData } from "../safeStorage/safeStorage";
import { performSignOut } from "../../main";
import { tryOpenExternalUrl } from "../security/externalUrl";

export const createMenu = () => {
  const isMac = process.platform === "darwin";

  if (isMac) {
    const template: MenuItemConstructorOptions[] = [
      {
        label: "Cozy Watch",
        submenu: [
          { role: "about" },
          { type: "separator" },
          { role: "services" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" },
        ],
      },

      {
        label: "File",
        submenu: [
          {
            label: "Sign Out",
            click: () => {
              performSignOut();
            },
          },
          ...(!app.isPackaged
            ? [
                {
                  label: "Clear Pull Request Cache",
                  click: () => {
                    deleteData("pull_requests_cache");
                  },
                },
                {
                  label: "Clear Repositories Cache",
                  click: () => {
                    deleteData("repositories_cache");
                  },
                },
                {
                  label: "Clear License Data",
                  click: async () => {
                    await Promise.all([
                      deleteData("licenseKey"),
                      deleteData("licenseState"),
                    ]);
                    app.relaunch();
                    app.exit();
                  },
                },
                {
                  label: "Clear Notification Settings",
                  click: () => {
                    deleteData("notifications");
                  },
                },
                {
                  label: "Notify Auth",
                  click: () => {
                    batchNotificationManager([
                      {
                        title: "GitHub Authentication",
                        body: `Your auth code is: 9HI9-CW25. Enter it at the opened URL.`,
                      },
                    ]);
                  },
                },
                {
                  label: "Notification Test",
                  click: () => {
                    const testMentionNotification = [
                      {
                        title: "CI 'US-EAST-1' Status Update",
                        body: "DNS Automation status changed from success to failure.",
                        type: "ci" as const,
                        url: "https://github.com/test/repo/issues/1",
                      },
                    ];

                    setTimeout(() => {
                      batchNotificationManager(testMentionNotification);
                      app.setBadgeCount(1);
                    }, 5000);
                  },
                },
              ]
            : []),
          { type: "separator" },
          { role: "close" },
        ],
      },
      // { role: 'editMenu' }
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "pasteAndMatchStyle" },
          { role: "delete" },
          { role: "selectAll" },
          { type: "separator" },
          {
            label: "Speech",
            submenu: [{ role: "startSpeaking" }, { role: "stopSpeaking" }],
          },
        ],
      },
      // { role: 'viewMenu' }
      // { role: 'windowMenu' }
      {
        label: "Window",
        submenu: [
          { role: "minimize" },
          { role: "zoom" },
          { type: "separator" },
          { role: "front" },
          { type: "separator" },
          { role: "window" },
        ],
      },
      {
        role: "help",
        submenu: [
          {
            label: "Learn More",
            click: () => {
              tryOpenExternalUrl("https://www.cozywatch.com");
            },
          },
          {
            label: "Open Logs Folder",
            click: () => {
              shell.openPath(app.getPath("logs"));
            },
          },
        ],
      },
    ];

    const menu = Menu.buildFromTemplate(template);

    return Menu.setApplicationMenu(menu);
  }

  const template: MenuItemConstructorOptions[] = [
    // { role: 'fileMenu' }
    {
      label: "File",
      submenu: [{ role: "quit" }],
    },
    // { role: 'editMenu' }
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "delete" },
        { type: "separator" },
        { role: "selectAll" },
      ],
    },
    // { role: 'viewMenu' }
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    // { role: 'windowMenu' }
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "close" }],
    },
    {
      role: "help",
      submenu: [
        {
          label: "Learn More",
          click: () => {
            tryOpenExternalUrl("https://www.cozywatch.com");
          },
        },
        {
          label: "Open Logs Folder",
          click: () => {
            shell.openPath(app.getPath("logs"));
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);

  Menu.setApplicationMenu(menu);
};
