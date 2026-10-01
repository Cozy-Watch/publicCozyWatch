import { BellIcon, GearIcon, SyncIcon } from "@primer/octicons-react";
import { Avatar, Button, Flex } from "@radix-ui/themes";
import { BuyLicenseButton } from "../../../../components/BuyLicenseButton/BuyLicenseButton";
import { useNotifications } from "../../../../hooks/useNotifications";

interface Props {
  avatarUrl?: string;
  login?: string;
  name?: string | null;
  isCompact: boolean;
}

export const Header = ({ avatarUrl, login, name, isCompact }: Props) => {
  const { data: notifications = [] } = useNotifications();
  const unreadCount = notifications.filter((notification) => !notification.read).length;

  return (
    <Flex align="center" justify="between">
      <Flex align="center" gap="2">
        <Flex
          width={isCompact ? "25px" : "40px"}
          height={isCompact ? "25px" : "40px"}
          style={
            isCompact
              ? {
                  borderRadius: "var(--radius-4)",
                  border: "1px solid var(--white-a12)",
                  background: "var(--white-a10)",
                  padding: "1px",
                }
              : {}
          }
          align="center"
          justify="center"
        >
          <img
            src={`./images/armchair.png`}
            width={isCompact ? "20px" : "40px"}
            height={isCompact ? "20px" : "40px"}
            style={{ borderRadius: isCompact ? 5 : 10 }}
          />
        </Flex>

        <BuyLicenseButton showImage={false} size="1" highContrast />
      </Flex>

      <Flex align="center" gap={isCompact ? "1" : "2"}>
        <Button
          variant="outline"
          aria-label={unreadCount > 0 ? `Notification settings, ${unreadCount} unread` : "Notification settings"}
          title="Notification settings"
          style={{ boxShadow: "none", color: "var(--accent-12)" }}
          onClick={() => {
            window.electronAPI.application.navigateToRoute("settings");
          }}
        >
          <BellIcon size={16} />
          {unreadCount > 0 && <span>{unreadCount > 99 ? "99+" : unreadCount}</span>}
        </Button>
        <Button
          variant="outline"
          style={{ boxShadow: "none", color: "var(--accent-12)" }}
          onClick={() => {
            window.electronAPI.application.navigateToRoute("settings");
          }}
        >
          <GearIcon size={16} />
        </Button>

        <Button
          variant="outline"
          style={{ boxShadow: "none", color: "var(--accent-12)" }}
          onClick={() => {
            window.electronAPI.application.refreshPoll();
          }}
        >
          <SyncIcon size={16} />
        </Button>

        <Avatar
          ml="2"
          src={avatarUrl}
          size={isCompact ? "1" : "3"}
          radius="full"
          fallback={login || name || "N/A"}
        />
      </Flex>
    </Flex>
  );
};
