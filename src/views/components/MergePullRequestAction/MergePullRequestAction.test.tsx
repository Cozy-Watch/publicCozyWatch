/** @jest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { Theme } from "@radix-ui/themes";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PullRequestList } from "../../../mainProcess/api/PullRequests/utils/getDefaultData";
import { MergePullRequestAction } from "./MergePullRequestAction";

const pullRequest = {
  number: 42,
  base: {
    repo: {
      name: "cozywatch",
      owner: { login: "cozy-watch" },
    },
  },
} as PullRequestList[0];

describe("MergePullRequestAction", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("registers the merge button as the accessible dialog trigger", async () => {
    await act(async () => {
      root.render(
        <Theme>
          <MergePullRequestAction pullRequest={pullRequest} />
        </Theme>,
      );
    });

    const trigger = container.querySelector("button");

    expect(trigger?.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
  });
});
