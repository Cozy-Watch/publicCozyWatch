import { Box, Card, Flex, Switch, Text } from "@radix-ui/themes";
import Logger from "electron-log";
import { useState } from "react";
import { useNotificationsMutation } from "../AppSettings/api/useNotificationsMutation";
import { useNotificationQuery } from "../AppSettings/api/useNotificationsQuery";
import { useToggleAllNotificationsMutation } from "../AppSettings/api/useToggleAllNotificationsMutation";
import { SettingsSection } from "./SettingsSection";

export const NotificationsSettings = () => {
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const { isPending, data: notifications } = useNotificationQuery();
  const { mutateAsync: toggleNotification } = useNotificationsMutation();
  const { mutateAsync: toggleAllNotifications } =
    useToggleAllNotificationsMutation();
  const notificationEntries = Object.entries(notifications ?? {});
  const areAllNotificationsEnabled =
    notificationEntries.length > 0 &&
    notificationEntries.every(([, notification]) => notification.value);

  return (
    <SettingsSection>
      <Card className="settings-card">
        <Flex gap="3" justify="between" align="center">
          <Flex direction="column" gap="2">
            <Text
              as="label"
              size="2"
              className="settings-control-label"
              htmlFor="notifications-enable-all"
            >
              Enable All
            </Text>
            <Text size="2" className="settings-card-description">
              Turn every notification type on or off.
            </Text>
          </Flex>
          <Switch
            id="notifications-enable-all"
            size="1"
            checked={areAllNotificationsEnabled}
            disabled={isPending || !notifications}
            onCheckedChange={async (checked) => {
              setSettingsError(null);
              try {
                await toggleAllNotifications(checked);
              } catch (error) {
                Logger.error("[NotificationsSettings] Error toggling all", {
                  error,
                });
                setSettingsError(
                  error instanceof Error
                    ? error.message
                    : "Unable to update notification settings.",
                );
              }
            }}
          />
        </Flex>
      </Card>

      <Card className="settings-card">
        <Flex direction="column" gap="4">
          <Flex direction="column" gap="1">
            <Text className="settings-card-title">Notifications</Text>
            <Text size="2" className="settings-card-description">
              What notifications do you want to receive?
            </Text>
          </Flex>

          <Flex direction="column" gap="4">
            {notificationEntries.map(([key, notification]) => {
              const switchId = `notification-${key}`;

              return (
                <Box key={key}>
                  <Flex gap="2" justify="between" align="center">
                    <Flex direction="column" gap="1">
                      <Text
                        as="label"
                        size="2"
                        className="settings-control-label"
                        htmlFor={switchId}
                      >
                        {notification.title}
                      </Text>
                      <Text size="2" className="settings-card-description">
                        {notification.description}
                      </Text>
                    </Flex>
                    <Switch
                      id={switchId}
                      size="1"
                      checked={notification.value}
                      onCheckedChange={async (checked) => {
                        setSettingsError(null);
                        try {
                          await toggleNotification({ checked, key });
                        } catch (error) {
                          Logger.error(
                            "[NotificationsSettings] Error toggling notification",
                            { error },
                          );
                          setSettingsError(
                            error instanceof Error
                              ? error.message
                              : "Unable to update notification settings.",
                          );
                        }
                      }}
                      disabled={isPending}
                    />
                  </Flex>
                </Box>
              );
            })}
          </Flex>
        </Flex>
      </Card>

      {settingsError && (
        <Text role="alert" color="red" size="2">
          {settingsError}
        </Text>
      )}
    </SettingsSection>
  );
};
