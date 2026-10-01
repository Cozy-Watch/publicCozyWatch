/** @jest-environment jsdom */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { act, ReactNode } from "react";
import { createRoot, Root } from "react-dom/client";
import { ActivityContent, renderActivityMarkdown } from "./ActivityContent";
import { LastActivity } from "../Review/components/LastActivity/LastActivity";
import { CIActions } from "../PullRequestsCard/components/CIActions/CIActions";
import type { PullsActions } from "../../../mainProcess/api/PullRequests/utils/getDefaultData";
import { Theme } from "@radix-ui/themes";

// Test the application's destinations without running floating-position layout
// against jsdom, which has no real element geometry.
jest.mock("@radix-ui/themes", () => {
  const actual =
    jest.requireActual<typeof import("@radix-ui/themes")>("@radix-ui/themes");
  const PassThrough = ({ children }: { children: ReactNode }) => (
    <>{children}</>
  );
  return {
    ...actual,
    Popover: { Root: PassThrough, Trigger: PassThrough, Content: PassThrough },
  };
});

const prUrl = "https://github.com/example/project/pull/7";
const reviewUrl = prUrl + "#pullrequestreview-123";
let container: HTMLDivElement;
let root: Root;
const openExternalLink = jest.fn<(url: string) => Promise<void>>();

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.assign(window, { electronAPI: { openExternalLink } });
  openExternalLink.mockReset().mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
}

describe("activity markdown", () => {
  it("preserves code, lists, quotes and responsive images while sanitizing active content", () => {
    container.innerHTML = renderActivityMarkdown(
      'Use `value`.\n\n```ts\nconst x = "<script>";\n```\n\n- item\n\n> quote\n\n![screen](./docs/screen.png)\n\n<img src="https://example.com/image.png" width="9999" onerror="alert(1)">\n<script>alert(1)</script><iframe src="https://example.com"></iframe><a href="javascript:alert(1)">unsafe</a>',
      reviewUrl,
    );
    expect(container.querySelector("pre code")?.textContent).toContain(
      'const x = "<script>";',
    );
    expect(container.querySelector("p code")?.textContent).toBe("value");
    expect(container.querySelector("li")?.textContent).toBe("item");
    expect(container.querySelector("blockquote")?.textContent).toContain(
      "quote",
    );
    const images = container.querySelectorAll("img");
    expect(images[0].src).toBe(
      "https://github.com/example/project/blob/HEAD/docs/screen.png?raw=true",
    );
    expect(images[1].src).toBe("https://example.com/image.png");
    expect(images[1].hasAttribute("width")).toBe(false);
    expect(
      container.querySelector("script, iframe, [onerror], a[href]"),
    ).toBeNull();
  });

  it("resolves root attachments and rejects unsafe image schemes", () => {
    container.innerHTML = renderActivityMarkdown(
      '![attachment](/user-attachments/assets/123)\n![bad](file:///etc/passwd)\n<img src="data:image/png;base64,AAAA">',
      reviewUrl,
    );
    expect(container.querySelector("img")?.src).toBe(
      "https://github.com/user-attachments/assets/123",
    );
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelectorAll(".activity-image-fallback")).toHaveLength(
      2,
    );
  });

  it("shows alt text after an image failure and preserves its enclosing action link", async () => {
    await act(async () =>
      root.render(
        <ActivityContent
          sourceUrl={reviewUrl}
          body={
            "[![Fix issue](https://example.com/broken.svg)](" + reviewUrl + ")"
          }
        />,
      ),
    );
    const img = container.querySelector("img")!;
    await act(async () => {
      img.dispatchEvent(new Event("error"));
    });
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("Image unavailable: Fix issue");
    await click(container.querySelector("a")!);
    expect(openExternalLink).toHaveBeenCalledWith(reviewUrl);
  });

  it("routes nested markdown clicks externally and reports rejected destinations", async () => {
    openExternalLink.mockRejectedValueOnce(new Error("Blocked"));
    await act(async () =>
      root.render(
        <ActivityContent
          sourceUrl={reviewUrl}
          body={"[**Review**](" + reviewUrl + ")"}
        />,
      ),
    );
    await click(container.querySelector("strong")!);
    expect(openExternalLink).toHaveBeenCalledWith(reviewUrl);
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "could not be opened",
    );
  });
});

it("expands accessibly and opens the exact review, with a PR fallback", async () => {
  await act(async () =>
    root.render(
      <Theme>
        <LastActivity
          pullRequestUrl={prUrl}
          reviewsGroupedbyUser={{
            reviewer: {
              state: "COMMENTED",
              userName: "reviewer",
              userAvatar: "",
              body: "Feedback",
              date: "",
              html_url: reviewUrl,
            },
            older: {
              state: "APPROVED",
              userName: "older",
              userAvatar: "",
              body: "",
              date: "",
            },
          }}
        />
      </Theme>,
    ),
  );
  const toggle = container.querySelector("button")!;
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  await click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  const links = container.querySelectorAll("a");
  await click(links[0]);
  await click(links[1]);
  expect(openExternalLink.mock.calls.map(([url]) => url)).toEqual([
    reviewUrl,
    prUrl,
  ]);
});

it.each([false, true])(
  "opens each CI run and the PR separately (compact=%s)",
  async (isCompact) => {
    const runUrl = "https://github.com/example/project/actions/runs/123";
    const run = {
      id: 123,
      name: "Build",
      html_url: runUrl,
      status: "in_progress",
      conclusion: null,
    } as PullsActions[0];
    await act(async () =>
      root.render(
        <Theme>
          <CIActions
            actionsByName={{ Build: [run] }}
            pullRequestLink={prUrl}
            isCompact={isCompact}
          />
        </Theme>,
      ),
    );
    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(2);
    await click(links[0]);
    await click(links[1]);
    expect(openExternalLink.mock.calls.map(([url]) => url)).toEqual([
      runUrl,
      prUrl,
    ]);
  },
);
