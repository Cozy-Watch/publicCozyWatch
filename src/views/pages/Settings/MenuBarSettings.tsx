import { Card, Flex, Switch, Text } from "@radix-ui/themes";
import Logger from "electron-log";
import { useState } from "react";
import { useMenubarDensityMutation } from "../AppSettings/api/useMenubarDensityMutation";
import { useMenubarDensityQuery } from "../AppSettings/api/useMenubarDensityQuery";

export const MenuBarSettings = () => {
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const { data: menubarDensity } = useMenubarDensityQuery();
  const { mutateAsync: setMenubarDensity } = useMenubarDensityMutation();

  return (
    <Flex direction="column" overflow="auto" height="100%" position="relative" pb="9">
      <Flex width="100%" direction="column" gap="4" p="4" flexGrow="1">
        <Card
          className="accent-shadow-low"
          style={{
            background:
              "linear-gradient(135deg, var(--accent-1), var(--accent-2), var(--accent-1))",
          }}
        >
          <Flex justify="between" align="center" gap="4">
            <Flex direction="column" gap="1">
              <Text weight="medium">Compact view</Text>
              <Text size="2" color="gray">
                Uses a smaller header, text, and pull request spacing to fit more
                in the menu bar. Turn it off for larger, easier-to-read cards.
              </Text>
            </Flex>
            <Switch
              size="1"
              checked={menubarDensity === "compact"}
              onCheckedChange={async (checked) => {
                setSettingsError(null);
                try {
                  await setMenubarDensity(checked ? "compact" : "default");
                } catch (error) {
                  Logger.error("[MenuBarSettings] Error toggling density", {
                    error,
                  });
                  setSettingsError(
                    error instanceof Error
                      ? error.message
                      : "Unable to update menu bar settings.",
                  );
                }
              }}
              aria-label="Compact menu bar view"
            />
          </Flex>
        </Card>
        {settingsError && (
          <Text role="alert" color="red" size="2">
            {settingsError}
          </Text>
        )}
      </Flex>
    </Flex>
  );
};
