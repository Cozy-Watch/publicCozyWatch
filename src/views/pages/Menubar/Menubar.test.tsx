/** @jest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { Theme } from "@radix-ui/themes";
import { useIsAuthenticatedQuery } from "../../api/useIsAuthenticatedQuery";
import { useMenubarDensityQuery } from "../AppSettings/api/useMenubarDensityQuery";
import { Menubar } from "./Menubar";
import { useMenubar } from "./useMenubar";

jest.mock("../../api/useIsAuthenticatedQuery", () => ({
  useIsAuthenticatedQuery: jest.fn(),
}));
jest.mock("../AppSettings/api/useMenubarDensityQuery", () => ({
  useMenubarDensityQuery: jest.fn(),
}));
jest.mock("./useMenubar", () => ({ useMenubar: jest.fn() }));
jest.mock("./components/Header/Header", () => ({
  Header: () => <div>Header</div>,
}));
jest.mock("./Tabs/My/My", () => ({
  My: () => <div>My pull-request panel</div>,
}));
jest.mock("./Tabs/Team/Team", () => ({
  Team: () => <div>Relevant pull-request panel</div>,
}));

const mockUseIsAuthenticatedQuery = jest.mocked(useIsAuthenticatedQuery);
const mockUseMenubarDensityQuery = jest.mocked(useMenubarDensityQuery);
const mockUseMenubar = jest.mocked(useMenubar);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.assign(window, {
    electronAPI: {
      application: {},
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  mockUseIsAuthenticatedQuery.mockReturnValue({
    data: true,
  } as ReturnType<typeof useIsAuthenticatedQuery>);
  mockUseMenubarDensityQuery.mockReturnValue({
    data: "standard",
  } as ReturnType<typeof useMenubarDensityQuery>);
  mockUseMenubar.mockReturnValue({
    data: {
      headerData: { avatarUrl: "", name: "Cozy", login: "cozy", id: 1 },
      myPullRequests: Array(100),
      teamPullRequests: Array(2),
    },
    error: null,
    isPending: false,
  } as ReturnType<typeof useMenubar>);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const renderMenubar = async () => {
  await act(async () => {
    root.render(
      <Theme>
        <Menubar />
      </Theme>,
    );
  });
};

const selectWithMouse = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
      }),
    );
  });
};

const pressKey = async (element: Element, key: string) => {
  await act(async () => {
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const focus = async (element: HTMLElement) => {
  await act(async () => {
    element.focus();
  });
};

describe("Menubar tabs", () => {
  it("shows sign-in without a version footer", async () => {
    mockUseIsAuthenticatedQuery.mockReturnValue({
      data: false,
    } as ReturnType<typeof useIsAuthenticatedQuery>);

    await renderMenubar();

    expect(container.textContent).toContain("Sign In to Github");
    expect(container.textContent).not.toContain("v0.9.6");
  });

  it("shows capped counts and selects the relevant panel by mouse or keyboard", async () => {
    await renderMenubar();

    const [mineTab, teamTab] = Array.from(
      container.querySelectorAll('[role="tab"]'),
    );

    expect(mineTab.textContent).toContain("My Pull Requests");
    expect(mineTab.textContent).toContain("99+");
    expect(teamTab.textContent).toContain("Relevant Pull Requests");
    expect(teamTab.textContent).toContain("2");
    expect(mineTab.classList.contains("menubar-classic-tab")).toBe(true);
    expect(teamTab.classList.contains("menubar-classic-tab")).toBe(true);
    expect(container.querySelector(".menubar-classic-tabs")).not.toBeNull();
    expect(container.querySelector(".menubar-classic-panel")).not.toBeNull();
    expect(container.textContent).not.toContain("v0.9.6");
    expect(mineTab.getAttribute("aria-selected")).toBe("true");
    expect(
      container.querySelector('[role="tabpanel"][data-state="active"]')
        ?.textContent,
    ).toContain("My pull-request panel");

    await selectWithMouse(teamTab);
    expect(teamTab.getAttribute("aria-selected")).toBe("true");
    expect(
      container.querySelector('[role="tabpanel"][data-state="active"]')
        ?.textContent,
    ).toContain("Relevant pull-request panel");

    await focus(teamTab as HTMLElement);
    await pressKey(teamTab, "ArrowLeft");
    expect(mineTab.getAttribute("aria-selected")).toBe("true");
    expect(
      container.querySelector('[role="tabpanel"][data-state="active"]')
        ?.textContent,
    ).toContain("My pull-request panel");
  });

  it("keeps the classic tabs and panel in compact density", async () => {
    mockUseMenubarDensityQuery.mockReturnValue({
      data: "compact",
    } as ReturnType<typeof useMenubarDensityQuery>);

    await renderMenubar();

    expect(container.querySelectorAll(".menubar-classic-tab")).toHaveLength(2);
    expect(container.querySelector(".menubar-classic-panel")).not.toBeNull();
    expect(container.textContent).not.toContain("v0.9.6");
  });
});
