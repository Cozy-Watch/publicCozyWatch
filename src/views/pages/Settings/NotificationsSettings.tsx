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
      <Card
        className="accent-shadow-low"
        style={{
          background:
            "linear-gradient(135deg, var(--accent-1), var(--accent-2), var(--accent-1))",
        }}
      >
        <Flex direction="column" gap="3">
          <Flex direction="column" gap="2">
            <Text weight="medium">Notifications</Text>
            <Text size="2" weight="light">
              What notifications do you want to receive?
            </Text>
          </Flex>

          <Flex direction="column" gap="2">
            <Flex gap="2" justify="between">
              <Text as="label" size="2" htmlFor="notifications-enable-all">
                Enable All:
              </Text>
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

            <Flex direction="column" gap="1">
              {notificationEntries.map(([key, notification]) => {
                const switchId = `notification-${key}`;

                return (
                  <Box key={key}>
                    <Flex gap="2" justify="between" align="center">
                      <Text as="label" size="2" htmlFor={switchId}>
                        {notification.title}
                      </Text>
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
