import { MentionIcon } from "@primer/octicons-react";
import { Tooltip } from "@radix-ui/themes";
import { useEffect, useState } from "react";
import {
  isRecentMention,
  MENTION_WINDOW_MS,
  type LatestMention,
} from "../../../../hooks/utils/getLatestMentions";
import { GitHubLink } from "../../../ActivityContent/GitHubLink";

export const RecentMention = ({ mention }: { mention?: LatestMention }) => {
  const [visible, setVisible] = useState(() => isRecentMention(mention, Date.now()));

  useEffect(() => {
    setVisible(isRecentMention(mention, Date.now()));
    if (!mention) return;
    const remaining = mention.timestamp + MENTION_WINDOW_MS - Date.now();
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setVisible(false), remaining);
    return () => window.clearTimeout(timer);
  }, [mention]);

  if (!mention || !visible) return null;

  return (
    <Tooltip content={`Mentioned by ${mention.author} · ${new Date(mention.timestamp).toLocaleString()}`}>
      <span className="pr-card-mention-wrap">
        <GitHubLink
          href={mention.url}
          className="pr-card-mention"
          ariaLabel={`Open latest mention by ${mention.author} on GitHub`}
        >
          <MentionIcon size={14} aria-hidden="true" />
        </GitHubLink>
      </span>
    </Tooltip>
  );
};
