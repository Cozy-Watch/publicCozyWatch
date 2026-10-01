/** @jest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Appearance, queryKey as appearanceKey } from "./useAppearanceQuery";
import { useAppearanceMutation } from "./useAppearanceMutation";
import { queryKey as openAtLoginKey } from "./useOpenAtLoginQuery";
import { useOpenAtLoginMutation } from "./useOpenAtLoginMutation";
import { menubarDensityQueryKey } from "./useMenubarDensityQuery";
import { useMenubarDensityMutation } from "./useMenubarDensityMutation";
import { queryKey as notificationsKey } from "./useNotificationsQuery";
import { useNotificationsMutation } from "./useNotificationsMutation";
import { useToggleAllNotificationsMutation } from "./useToggleAllNotificationsMutation";
import { NOTIFICATION_DEFAULT_SETTINGS } from "../../../../mainProcess/notifications/notifications.meta";
import type { NotificationSettingsPerKey } from "../../../../mainProcess/safeStorage/safeStorage.types";

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;
const setApplicationAppearance = jest.fn<(value: Appearance | null) => Promise<Appearance | null>>();
const setStartAtLogin = jest.fn<(value: boolean) => Promise<boolean>>();
const setMenubarDensity = jest.fn<(value: "compact" | "default") => Promise<string>>();
const setNotificationSetting = jest.fn<(value: { checked: boolean; key: string }) => Promise<void>>();
const setToggleAllNotifications = jest.fn<() => Promise<NotificationSettingsPerKey>>();

const MutationHarness = () => {
  const appearance = useAppearanceMutation();
  const openAtLogin = useOpenAtLoginMutation();
  const menubar = useMenubarDensityMutation();
  const notification = useNotificationsMutation();
  const notifications = useToggleAllNotificationsMutation();
  return (
    <>
      <button onClick={() => appearance.mutate(Appearance.Dark)}>Set dark</button>
      <button onClick={() => appearance.mutate(null)}>Set system</button>
      <button onClick={() => openAtLogin.mutate(true)}>Enable login</button>
      <button onClick={() => menubar.mutate("compact")}>Compact view</button>
      <button
        onClick={() => notification.mutate({ checked: false, key: "ciStatusNotification" })}
      >
        Disable CI notifications
      </button>
      <button onClick={() => notifications.mutate(false)}>Disable notifications</button>
    </>
  );
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.assign(window, {
    electronAPI: {
      application: {
        setApplicationAppearance,
        setStartAtLogin,
        setMenubarDensity,
        setNotificationSetting,
        setToggleAllNotifications,
      },
    },
  });
  setApplicationAppearance.mockReset().mockImplementation(async (value) => value);
  setStartAtLogin.mockReset().mockImplementation(async (value) => value);
  setMenubarDensity.mockReset().mockImplementation(async (value) => value);
  setNotificationSetting.mockReset().mockResolvedValue(undefined);
  setToggleAllNotifications.mockReset().mockImplementation(async () => ({
    ...NOTIFICATION_DEFAULT_SETTINGS,
    ciStatusNotification: {
      ...NOTIFICATION_DEFAULT_SETTINGS.ciStatusNotification,
      value: false,
    },
  }));
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  queryClient.clear();
  container.remove();
});

const click = async (label: string) => {
  const button = [...container.querySelectorAll("button")].find(
    (item) => item.textContent === label,
  );
  if (!button) throw new Error(`Missing button: ${label}`);
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
};

const render = async () => {
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <MutationHarness />
      </QueryClientProvider>,
    );
  });
};

it("updates appearance when the stored value is System", async () => {
  queryClient.setQueryData(appearanceKey, null);
  await render();
  await click("Set dark");

  expect(setApplicationAppearance).toHaveBeenCalledWith(Appearance.Dark);
  expect(queryClient.getQueryData(appearanceKey)).toBe(Appearance.Dark);
});

it("keeps System as a valid appearance value", async () => {
  queryClient.setQueryData(appearanceKey, Appearance.Dark);
  await render();
  await click("Set system");

  expect(setApplicationAppearance).toHaveBeenCalledWith(null);
  expect(queryClient.getQueryData(appearanceKey)).toBeNull();
});

it("updates the login switch cache from the confirmed native result", async () => {
  queryClient.setQueryData(openAtLoginKey, false);
  await render();
  await click("Enable login");

  expect(setStartAtLogin).toHaveBeenCalledWith(true);
  expect(queryClient.getQueryData(openAtLoginKey)).toBe(true);
});

it("rolls back optimistic appearance updates when saving fails", async () => {
  queryClient.setQueryData(appearanceKey, null);
  setApplicationAppearance.mockRejectedValueOnce(new Error("Save failed"));
  await render();
  await click("Set dark");

  expect(queryClient.getQueryData(appearanceKey)).toBeNull();
});

it("updates menu bar density after saving", async () => {
  queryClient.setQueryData(menubarDensityQueryKey, "default");
  await render();
  await click("Compact view");

  expect(setMenubarDensity).toHaveBeenCalledWith("compact");
  expect(queryClient.getQueryData(menubarDensityQueryKey)).toBe("compact");
});

it("updates an individual notification setting after saving", async () => {
  queryClient.setQueryData(notificationsKey, NOTIFICATION_DEFAULT_SETTINGS);
  await render();
  await click("Disable CI notifications");

  expect(setNotificationSetting).toHaveBeenCalledWith({
    checked: false,
    key: "ciStatusNotification",
  });
  expect(
    queryClient.getQueryData<NotificationSettingsPerKey>(notificationsKey)
      ?.ciStatusNotification.value,
  ).toBe(false);
});

it("updates all notification settings from the saved result", async () => {
  queryClient.setQueryData(notificationsKey, NOTIFICATION_DEFAULT_SETTINGS);
  await render();
  await click("Disable notifications");

  expect(setToggleAllNotifications).toHaveBeenCalled();
  expect(
    queryClient.getQueryData<NotificationSettingsPerKey>(notificationsKey)
      ?.ciStatusNotification.value,
  ).toBe(false);
});
