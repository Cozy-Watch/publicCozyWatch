import {
  AlertIcon,
  BellIcon,
  ChevronDownIcon,
  DeviceDesktopIcon,
  PersonIcon,
  SignOutIcon,
  SyncIcon,
} from "@primer/octicons-react";
import {
  Avatar,
  Badge,
  Box,
  DropdownMenu,
  Flex,
  Spinner,
  Text,
} from "@radix-ui/themes";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ErrorMessage } from "../../components/ErrorMessage/ErrorMessage";
import { LicenseModal } from "../../components/LicenseModal/LicenseModal";
import { LicenseExpiryReminder } from "../../components/LicenseStatus/LicenseExpiryReminder";
import { LicenseStatusBadge } from "../../components/LicenseStatus/LicenseStatusBadge";
import { isCommercialUseLicensed } from "../../components/LicenseStatus/licenseStatus.utils";
import { CozyWatch } from "../../components/SVG/CozyWatch";
import { WhiteCozyWatch } from "../../components/SVG/WhiteCozyWatch";
import { useHeader } from "./useHeader";
import { useNotifications } from "../../hooks/useNotifications";

export const Header = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const {
    isPending,
    error,
    data,
    action: { onSignOut, onRefresh },
  } = useHeader();

  const navigation = useNavigate();
  const location = useLocation();
  const { data: notifications = [] } = useNotifications();
  const unreadCount = notifications.filter((notification) => !notification.read).length;

  if (isPending) {
    return <Spinner size="2" />;
  }
  if (error) {
    <Box mt="6">
      <ErrorMessage message={error.message} />
    </Box>;
  }
  if (!data) {
    return null;
  }
  const { licenseState, errors } = data;
  const hasCommercialLicense = isCommercialUseLicensed(licenseState);

  return (
    <Flex direction="column" flexGrow="1" position="relative" p="4" pt="0">
      <Flex gap="2" flexGrow="1" align="center" justify="between">
        <Flex align="center" gap="4">
          <Flex align="center" gap="2">
            <img src="./images/icon.png" width="28" />
            <CozyWatch
              style={{ marginBottom: "-4px" }}
              src="./images/cozywatch.svg"
              height="22"
            />
          </Flex>
          <LicenseStatusBadge state={licenseState} />
        </Flex>
        <Flex gap="4" align="center">
          {errors.length === 0 ? null : (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                <Badge color="gray" radius="full">
                  <Box p="1">
                    <Text color="red" className="bright-background-text-shadow">
                      <AlertIcon size={18} />
                    </Text>
                  </Box>
                </Badge>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content>
                <Flex gap="1" direction="column">
                  {errors.map((error) => (
                    <Text key={error} size="1" color="red">
                      {error}
                    </Text>
                  ))}
                </Flex>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          )}

          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              aria-label={
                unreadCount > 0
                  ? `Open user menu, ${unreadCount} unread notifications`
                  : "Open user menu"
              }
            >
              <Flex align="center" gap="2">
                <Box position="relative">
                  <Avatar
                    src={data.avatarUrl}
                    size="2"
                    radius="full"
                    fallback={data.login || "N/A"}
                    className="accent-shadow-low"
                  />
                  {unreadCount > 0 && (
                    <Badge
                      className="desktop-avatar-notification-count"
                      color="red"
                      size="1"
                    >
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </Badge>
                  )}
                </Box>
                <ChevronDownIcon size={16} />
              </Flex>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content>
              <Flex p="2">
                <Text size="2" weight="medium">
                  {data.name}
                </Text>
              </Flex>

              <DropdownMenu.Separator />
              {!hasCommercialLicense && (
                <DropdownMenu.Item
                  color="green"
                  onClick={() => {
                    setIsModalOpen(true);
                  }}
                >
                  <WhiteCozyWatch height="16px" />
                  Official distribution license
                </DropdownMenu.Item>
              )}
              <DropdownMenu.Item
                onClick={() => {
                  onRefresh();
                }}
              >
                <SyncIcon size={16} />
                Refresh
              </DropdownMenu.Item>
              <DropdownMenu.Item
                aria-current={location.pathname === "/notifications" ? "page" : undefined}
                onClick={() => navigation({ to: "/notifications" })}
              >
                <BellIcon size={16} />
                Notifications
                {unreadCount > 0 && (
                  <Badge color="red">{unreadCount > 99 ? "99+" : unreadCount}</Badge>
                )}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onClick={() => {
                  navigation({ to: "/settings" });
                }}
              >
                <DeviceDesktopIcon size={16} />
                Settings
              </DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Item
                color="red"
                onClick={() => {
                  onSignOut();
                }}
              >
                <SignOutIcon size={16} />
                Logout
              </DropdownMenu.Item>

              <DropdownMenu.Item
                onClick={() => {
                  window.electronAPI.openExternalLink(
                    "https://www.cozywatch.com/invite",
                  );
                }}
              >
                <PersonIcon size={16} />
                Invite Friends
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </Flex>
      </Flex>
      <LicenseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
      <LicenseExpiryReminder
        state={licenseState}
        onManageLicense={() =>
          navigation({ to: "/settings", search: { tab: "license" } })
        }
      />
    </Flex>
  );
};
