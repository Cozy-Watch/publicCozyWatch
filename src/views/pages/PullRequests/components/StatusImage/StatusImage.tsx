import { Tooltip } from "@radix-ui/themes";

type StatusKey = "APPROVED" | "COMMENTED" | "CHANGES_REQUESTED";

interface Props {
  status: StatusKey;
}

export const StatusImage = ({ status }: Props) => {
  const statusDisplay = {
    APPROVED: { label: "Approved", symbol: "✓", color: "#2da44e" },
    COMMENTED: { label: "Commented", symbol: "…", color: "#8250df" },
    CHANGES_REQUESTED: {
      label: "Changes Requested",
      symbol: "!",
      color: "#cf222e",
    },
  }[status];

  return (
    <Tooltip content={statusDisplay.label}>
      <span
        aria-label={statusDisplay.label}
        role="img"
        style={{
          alignItems: "center",
          backgroundColor: statusDisplay.color,
          borderRadius: "50%",
          color: "white",
          display: "inline-flex",
          fontSize: 10,
          fontWeight: 700,
          height: 14,
          justifyContent: "center",
          lineHeight: 1,
          width: 14,
        }}
      >
        {statusDisplay.symbol}
      </span>
    </Tooltip>
  );
};
