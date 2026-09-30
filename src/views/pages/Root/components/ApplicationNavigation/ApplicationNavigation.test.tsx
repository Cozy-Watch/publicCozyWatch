/** @jest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Theme } from "@radix-ui/themes";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useLocation } from "@tanstack/react-router";
import { usePullRequest } from "../../../../hooks/usePullRequests";
import { ApplicationNavigation } from "./ApplicationNavigation";

jest.mock("@tanstack/react-router", () => ({
  Link: ({ to, ...props }: { to: string }) => <a href={to} {...props} />,
  useLocation: jest.fn(),
}));

jest.mock("../../../../hooks/usePullRequests", () => ({
  usePullRequest: jest.fn(),
}));

const mockUseLocation = jest.mocked(useLocation);
const mockUsePullRequest = jest.mocked(usePullRequest);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  mockUsePullRequest.mockReturnValue({
    data: {
      myPullRequests: Array(100),
      teamPullRequests: Array(2),
      fullyApproved: Array(3),
      waitingReview: Array(4),
      reviewed: Array(5),
      mentionsInMyPr: Array(6),
      waitingMyReview: Array(7),
      teamFullyApproved: Array(8),
      reviewedByMe: Array(9),
      mentionsInTeamsPr: Array(10),
    },
    isFetching: false,
  } as ReturnType<typeof usePullRequest>);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const renderNavigation = async (pathname: string) => {
  mockUseLocation.mockReturnValue({ pathname } as ReturnType<typeof useLocation>);

  await act(async () => {
    root.render(
      <Theme>
        <ApplicationNavigation />
      </Theme>,
    );
  });
};

describe("ApplicationNavigation", () => {
  it("renders the primary links with capped pull-request counts", async () => {
    await renderNavigation("/overview");

    expect(container.textContent).toContain("Overview");
    expect(container.textContent).toContain("My Pull Requests");
    expect(container.querySelector('a[href="/teamPullRequest"]')?.textContent).toContain("Relevant Pull Requests");
    expect(container.textContent).toContain("Mentions");
    expect(container.textContent).toContain("99+");
    expect(container.querySelectorAll('a[aria-current="page"]')).toHaveLength(1);
    expect(container.querySelector('a[href="/overview"]')).not.toBeNull();
    expect(container.querySelectorAll(".desktop-classic-tab")).toHaveLength(4);
    expect(container.querySelector(".desktop-classic-tabs")).not.toBeNull();
  });

  it("renders the relevant pull-request badge filters", async () => {
    await renderNavigation("/teamPullRequest/pendingReviews");

    expect(container.textContent).toContain("Awaiting My Review");
    expect(container.textContent).toContain("Reviewed by Me");
    expect(container.textContent).not.toContain("Pending Review");
    expect(
      container
        .querySelector('a[href="/teamPullRequest/pendingReviews"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(container.querySelectorAll('a[aria-current="page"]')).toHaveLength(1);
    expect(container.querySelector(".desktop-classic-filters")).not.toBeNull();
  });
});
