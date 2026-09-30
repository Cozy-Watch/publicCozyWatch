import { Badge, Button, Card, DropdownMenu, Flex, Grid, Switch, Text } from "@radix-ui/themes";
import Logger from "electron-log";
import { useEffect, useState } from "react";
import { Appearance } from "../../../state/appState";
import {
  ACCENT_COLORS,
  DEFAULT_ACCENT_COLOR,
  isAccentColor,
} from "../../../shared/theme";
import { useAccentColorMutation } from "./api/useAccentColorMutation";
import { useAccentColorQuery } from "./api/useAccentColorQuery";
import { useAppearanceMutation } from "./api/useAppearanceMutation";
import { useAppearanceQuery } from "./api/useAppearanceQuery";
import { useOpenAtLoginMutation } from "./api/useOpenAtLoginMutation";
import { useOpenAtLoginQuery } from "./api/useOpenAtLoginQuery";
import { SettingsSection } from "../Settings/SettingsSection";

export const AppSettings = () => {
  const [diagnosticsEnabled, setDiagnosticsEnabled] = useState(false);
  const [diagnosticsStatusError, setDiagnosticsStatusError] = useState<
    string | null
  >(null);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const [isExportingDiagnostics, setIsExportingDiagnostics] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const { data: hasOpenAtLogin, isPending: isOpenAtLoginLoading } = useOpenAtLoginQuery();
  const {
    mutateAsync: saveIsOpenAtLogin,
    isPending: isSavingOpenAtLogin,
  } = useOpenAtLoginMutation();
  const { data: appearance, isPending: isAppearanceLoading } = useAppearanceQuery();
  const {
    mutateAsync: saveAppearance,
    isPending: isSavingAppearance,
  } = useAppearanceMutation();
  const { data: storedAccentColor } = useAccentColorQuery();
  const { mutateAsync: saveAccentColor } = useAccentColorMutation();
  const accentColor = storedAccentColor ?? DEFAULT_ACCENT_COLOR;
  const appearanceValue = appearance ?? "system";

  const updateOpenAtLogin = async (checked: boolean) => {
    setSettingsError(null);
    try {
      await saveIsOpenAtLogin(checked);
    } catch (error) {
      Logger.error("[AppSettings] Error toggling Open At login", { error });
      setSettingsError(
        error instanceof Error ? error.message : "Unable to update Open at login.",
      );
    }
  };

  const updateAppearance = async (nextAppearance: Appearance | null) => {
    setSettingsError(null);
    try {
      await saveAppearance(nextAppearance);
    } catch (error) {
      Logger.error("[AppSettings] Error updating appearance", { error });
      setSettingsError(
        error instanceof Error ? error.message : "Unable to update appearance.",
      );
    }
  };

  useEffect(() => {
    void window.electronAPI.application
      .getDiagnosticsStatus()
      .then(({ enabled }) => {
        setDiagnosticsEnabled(enabled);
        setDiagnosticsStatusError(null);
      })
      .catch((error) => {
        Logger.error("[AppSettings] Failed to load diagnostics status", {
          error,
        });
        setDiagnosticsStatusError(
          error instanceof Error
            ? error.message
            : "Unable to load diagnostics status. Please try again.",
        );
      });
  }, []);

  const exportDiagnostics = async () => {
    setDiagnosticsError(null);
    setIsExportingDiagnostics(true);

    try {
      await window.electronAPI.application.exportDiagnosticsBundle();
    } catch (error) {
      setDiagnosticsError(
        error instanceof Error
          ? error.message
          : "Unable to export diagnostics. Please try again.",
      );
    } finally {
      setIsExportingDiagnostics(false);
    }
  };

  return (
    <SettingsSection>
      <Grid columns="1fr" gap="4">
        <Card className="accent-shadow-low">
          <Flex justify="between" align="center">
            <Text weight="medium">Open at login:</Text>
            <Switch
              size="1"
              aria-label="Open at login"
              checked={hasOpenAtLogin ?? false}
              disabled={isOpenAtLoginLoading || isSavingOpenAtLogin}
              onCheckedChange={(checked) => void updateOpenAtLogin(checked)}
            />
          </Flex>
        </Card>

        <Card className="accent-shadow-low">
          <Flex direction="column" gap="3">
            <Flex align="center" justify="between">
              <Text weight="medium">Appearance:</Text>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger>
                  <Button
                    variant="surface"
                    style={{ width: 180 }}
                    disabled={isAppearanceLoading || isSavingAppearance}
                  >
                    {appearance === Appearance.Light
                      ? "Light"
                      : appearance === Appearance.Dark
                        ? "Dark"
                        : "System"}
                    <DropdownMenu.TriggerIcon />
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content>
                  <DropdownMenu.RadioGroup
                    value={appearanceValue}
                    onValueChange={(value) => {
                      if (value === "system") {
                        void updateAppearance(null);
                        return;
                      }

                      if (value === Appearance.Light || value === Appearance.Dark) {
                        void updateAppearance(value);
                      }
                    }}
                  >
                    <DropdownMenu.RadioItem
                      value={Appearance.Light}
                      disabled={isSavingAppearance}
                    >
                      Light
                    </DropdownMenu.RadioItem>
                    <DropdownMenu.RadioItem
                      value={Appearance.Dark}
                      disabled={isSavingAppearance}
                    >
                      Dark
                    </DropdownMenu.RadioItem>
                    <DropdownMenu.RadioItem
                      value="system"
                      disabled={isSavingAppearance}
                    >
                      System
                    </DropdownMenu.RadioItem>
                  </DropdownMenu.RadioGroup>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            </Flex>
            <Flex align="center" justify="between">
              <Text weight="medium">Accent color:</Text>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger>
                  <Button variant="surface" style={{ width: 180 }}>
                    <Badge
                      aria-hidden
                      color={accentColor}
                      radius="full"
                      variant="solid"
                      style={{ height: 12, minWidth: 12, padding: 0 }}
                    />
                    {accentColor.charAt(0).toUpperCase() + accentColor.slice(1)}
                    <DropdownMenu.TriggerIcon />
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="end">
                  <DropdownMenu.RadioGroup
                    value={accentColor}
                    onValueChange={(value) => {
                      if (!isAccentColor(value) || value === accentColor) return;

                      void saveAccentColor(value).catch((error) => {
                        Logger.error("[AppSettings] Error updating accent color", {
                          error,
                        });
                        setSettingsError(
                          error instanceof Error
                            ? error.message
                            : "Unable to update accent color.",
                        );
                      });
                    }}
                  >
                    <Grid columns="1fr 1fr" gap="1" p="1">
                      {ACCENT_COLORS.map((color) => (
                        <DropdownMenu.RadioItem key={color} value={color}>
                          <Flex align="center" gap="2">
                            <Badge
                              aria-hidden
                              color={color}
                              radius="full"
                              variant="solid"
                              style={{ height: 12, minWidth: 12, padding: 0 }}
                            />
                            {color.charAt(0).toUpperCase() + color.slice(1)}
                          </Flex>
                        </DropdownMenu.RadioItem>
                      ))}
                    </Grid>
                  </DropdownMenu.RadioGroup>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            </Flex>
          </Flex>
        </Card>
      </Grid>

      {settingsError && (
        <Text role="alert" color="red" size="2">
          {settingsError}
        </Text>
      )}

      {(diagnosticsEnabled || diagnosticsStatusError) && (
        <Card className="accent-shadow-low">
          <Flex align="center" justify="between" gap="3">
            <Flex direction="column" gap="1">
              <Text weight="medium">Performance diagnostics</Text>
              <Text size="2" color="gray">
                Export redacted startup, responsiveness, and resource metrics
                for support.
              </Text>
              {diagnosticsStatusError && (
                <Text size="2" color="red">
                  {diagnosticsStatusError}
                </Text>
              )}
              {diagnosticsError && (
                <Text size="2" color="red">
                  {diagnosticsError}
                </Text>
              )}
            </Flex>
            <Button
              variant="outline"
              onClick={() => void exportDiagnostics()}
              disabled={isExportingDiagnostics}
            >
              {isExportingDiagnostics ? "Exporting..." : "Export diagnostics"}
            </Button>
          </Flex>
        </Card>
      )}
    </SettingsSection>
  );
};
