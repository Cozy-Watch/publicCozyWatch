import { useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { renderSafeMarkdown } from "../../utils/renderSafeMarkdown";

export function resolveActivityUrl(
  value: string,
  sourceUrl: string,
): string | undefined {
  if (!value.trim()) return;
  try {
    const source = new URL(sourceUrl);
    if (source.protocol !== "https:" || source.hostname !== "github.com")
      return;
    // GitHub repository-relative content is rooted at the repository's default branch.
    const [owner, repo] = source.pathname.split("/").filter(Boolean);
    const base =
      owner && repo
        ? `https://github.com/${owner}/${repo}/blob/HEAD/`
        : source.href;
    const url = new URL(value, value.startsWith("#") ? source.href : base);
    if (url.protocol === "https:" && !url.username && !url.password)
      return url.href;
  } catch {
    /* Invalid URLs are rendered without a destination. */
  }
}

export function renderActivityMarkdown(body: string, sourceUrl: string) {
  const template = document.createElement("template");
  template.innerHTML = renderSafeMarkdown(body);
  template.content.querySelectorAll("a").forEach((anchor) => {
    const href = resolveActivityUrl(
      anchor.getAttribute("href") || "",
      sourceUrl,
    );
    anchor.removeAttribute("target");
    if (href) anchor.setAttribute("href", href);
    else anchor.removeAttribute("href");
  });
  template.content.querySelectorAll("img").forEach((img) => {
    const raw = img.getAttribute("src");
    let src = raw ? resolveActivityUrl(raw, sourceUrl) : undefined;
    if (src) {
      const url = new URL(src);
      if (
        url.hostname === "github.com" &&
        /^\/[^/]+\/[^/]+\/blob\//.test(url.pathname)
      ) {
        url.searchParams.set("raw", "true");
        src = url.href;
      }
    }
    img.removeAttribute("srcset");
    img.removeAttribute("width");
    img.removeAttribute("height");
    img.setAttribute("loading", "lazy");
    img.setAttribute("referrerpolicy", "no-referrer");
    if (src) img.setAttribute("src", src);
    else replaceFailedImage(img);
  });
  return template.innerHTML;
}

export function replaceFailedImage(img: HTMLImageElement) {
  const fallback = document.createElement("span");
  fallback.className = "activity-image-fallback";
  fallback.textContent = `Image unavailable: ${img.alt || "attached image"}`;
  img.replaceWith(fallback);
}

export function ActivityContent({
  body,
  sourceUrl,
}: {
  body: string;
  sourceUrl: string;
}) {
  const html = useMemo(
    () => renderActivityMarkdown(body, sourceUrl),
    [body, sourceUrl],
  );
  const [error, setError] = useState(false);
  const openLink = async (event: MouseEvent<HTMLDivElement>) => {
    const anchor =
      event.target instanceof Element ? event.target.closest("a") : null;
    if (!anchor || !event.currentTarget.contains(anchor)) return;
    event.preventDefault();
    const href = anchor.getAttribute("href");
    if (!href) return;
    setError(false);
    try {
      await window.electronAPI.openExternalLink(href);
    } catch {
      setError(true);
    }
  };
  return (
    <>
      <div
        className="activity-markdown"
        onClick={openLink}
        onAuxClick={openLink}
        onErrorCapture={(event) => {
          if (event.target instanceof HTMLImageElement)
            replaceFailedImage(event.target);
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {error && (
        <p role="status">
          This link could not be opened. View the activity on GitHub instead.
        </p>
      )}
    </>
  );
}
