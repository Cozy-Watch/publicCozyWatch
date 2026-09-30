import { Tooltip } from "@radix-ui/themes";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

interface Props {
  timestamp: number;
}

export const FeedbackTime = ({ timestamp }: Props) => {
  const feedbackAt = dayjs(timestamp);

  return (
    <Tooltip content={`Latest feedback ${feedbackAt.format("MMM D, YYYY [at] HH:mm")}`}>
      <time className="pr-card-time" dateTime={feedbackAt.toISOString()}>
        Feedback {feedbackAt.fromNow()}
      </time>
    </Tooltip>
  );
};
