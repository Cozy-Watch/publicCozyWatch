import { Badge, Flex } from "@radix-ui/themes";

interface Props {
  items: {
    id: number;
    node_id: string;
    url: string;
    name: string;
    description: string;
    color: string;
    default: boolean;
  }[];
}

const getLabelColors = (color: string) => {
  if (!/^[0-9a-fA-F]{6}$/.test(color)) return null;

  const channels = [0, 2, 4].map((offset) => {
    const value = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  const darkTextContrast = (luminance + 0.05) / 0.055;
  const lightTextContrast = 1.05 / (luminance + 0.05);

  return {
    backgroundColor: `#${color}`,
    color: darkTextContrast >= lightTextContrast ? "#0d1117" : "#ffffff",
  };
};

export const Labels = ({ items }: Props) => {
  if (items.length === 0) return null;

  return (
    <Flex align="center" gap="2" wrap="wrap">
      {items.map(({ id, name, color }) => {
        const labelColors = getLabelColors(color);

        return (
          <Badge
            size="1"
            key={id}
            color="gray"
            variant={labelColors ? "solid" : "soft"}
            style={{ maxWidth: "100%", overflowWrap: "anywhere", ...labelColors }}
          >
            {name}
          </Badge>
        );
      })}
    </Flex>
  );
};
