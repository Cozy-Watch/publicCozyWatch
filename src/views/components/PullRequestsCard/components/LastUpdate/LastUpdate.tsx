import { Tooltip } from "@radix-ui/themes";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

interface Props {
  updatedAt: string;
}

export const LastUpdate = ({ updatedAt }: Props) => (
  <Tooltip content={`Updated ${dayjs(updatedAt).format("MMM D, YYYY [at] HH:mm")}`}>
    <time className="pr-card-time" dateTime={updatedAt}>
      {dayjs(updatedAt).fromNow()}
    </time>
  </Tooltip>
);
