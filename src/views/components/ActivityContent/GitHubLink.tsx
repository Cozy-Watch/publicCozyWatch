import { useState } from "react";
import type { ReactNode } from "react";

export function GitHubLink({
  href,
  children,
  className = "activity-link",
  ariaLabel,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <>
      <a
        href={href}
        className={className}
        aria-label={ariaLabel}
        onClick={async (event) => {
          event.preventDefault();
          setFailed(false);
          try {
            await window.electronAPI.openExternalLink(href);
          } catch {
            setFailed(true);
          }
        }}
        onAuxClick={(event) => event.preventDefault()}
      >
        {children}
      </a>
      {failed && (
        <span role="status">Could not open GitHub. Please try again.</span>
      )}
    </>
  );
}
