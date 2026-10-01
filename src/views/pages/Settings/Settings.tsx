import { ArrowLeftIcon } from "@radix-ui/react-icons";
import { Button, Flex, Tabs, Text } from "@radix-ui/themes";
import { Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppSettings } from "../AppSettings/AppSettings";
import { Repositories } from "../Repositories/Repositories";
import { FeedbackSettings } from "./FeedbackSettings";
import { GitHubSettings } from "./GitHubSettings";
import { LicenseSettings } from "./LicenseSettings";
import { MenuBarSettings } from "./MenuBarSettings";
import { NotificationsSettings } from "./NotificationsSettings";

const sectionIds = [
  "application",
  "github",
  "repositories",
  "notifications",
  "menubar",
  "license",
  "feedback",
] as const;

type SettingsSectionId = (typeof sectionIds)[number];

const isSettingsSectionId = (value: unknown): value is SettingsSectionId =>
  typeof value === "string" && (sectionIds as readonly string[]).includes(value);

const getInitialSection = (value: unknown): SettingsSectionId =>
  isSettingsSectionId(value) ? value : "application";

export const Settings = () => {
  const { tab } = useSearch({ from: "/settings" });
  const [selectedSection, setSelectedSection] =
    useState<SettingsSectionId>(() => getInitialSection(tab));

  useEffect(() => {
    setSelectedSection(getInitialSection(tab));
  }, [tab]);

  return (
    <Flex
      className="settings-page"
      direction="column"
      width="100%"
      height="100%"
      minHeight="0"
      overflow="hidden"
    >
      <Flex
        px="4"
        pt="3"
        pb="2"
        align="center"
        justify="between"
        flexShrink="0"
      >
        <Text size="5" weight="bold">
          Settings
        </Text>
        <Button asChild variant="ghost" size="2">
          <Link to="/overview">
            <ArrowLeftIcon />
            Back
          </Link>
        </Button>
      </Flex>

      <Tabs.Root
        orientation="vertical"
        value={selectedSection}
        onValueChange={(value) => {
          setSelectedSection(
            isSettingsSectionId(value) ? value : "application",
          );
        }}
        asChild
      >
        <Flex
          className="settings-layout"
          width="100%"
          height="100%"
          flexGrow="1"
          minHeight="0"
          overflow="hidden"
        >
          <Tabs.List
            className="settings-sidebar"
            aria-label="Settings sections"
          >
            <Tabs.Trigger
              className="settings-sidebar-trigger"
              value="application"
            >
              Application
            </Tabs.Trigger>
            <Tabs.Trigger className="settings-sidebar-trigger" value="github">
              GitHub
            </Tabs.Trigger>
            <Tabs.Trigger
              className="settings-sidebar-trigger"
              value="repositories"
            >
              Repositories
            </Tabs.Trigger>
            <Tabs.Trigger
              className="settings-sidebar-trigger"
              value="notifications"
            >
              Notifications
            </Tabs.Trigger>
            <Tabs.Trigger className="settings-sidebar-trigger" value="menubar">
              Menu Bar
            </Tabs.Trigger>
            <Tabs.Trigger className="settings-sidebar-trigger" value="license">
              License
            </Tabs.Trigger>
            <Tabs.Trigger className="settings-sidebar-trigger" value="feedback">
              Feedback
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content className="settings-section-panel" value="application">
            {selectedSection === "application" ? <AppSettings /> : null}
          </Tabs.Content>
          <Tabs.Content className="settings-section-panel" value="github">
            {selectedSection === "github" ? <GitHubSettings /> : null}
          </Tabs.Content>
          <Tabs.Content className="settings-section-panel" value="repositories">
            {selectedSection === "repositories" ? <Repositories /> : null}
          </Tabs.Content>
          <Tabs.Content className="settings-section-panel" value="notifications">
            {selectedSection === "notifications" ? (
              <NotificationsSettings />
            ) : null}
          </Tabs.Content>
          <Tabs.Content className="settings-section-panel" value="menubar">
            {selectedSection === "menubar" ? <MenuBarSettings /> : null}
          </Tabs.Content>
          <Tabs.Content className="settings-section-panel" value="license">
            {selectedSection === "license" ? <LicenseSettings /> : null}
          </Tabs.Content>
          <Tabs.Content className="settings-section-panel" value="feedback">
            {selectedSection === "feedback" ? <FeedbackSettings /> : null}
          </Tabs.Content>
        </Flex>
      </Tabs.Root>
    </Flex>
  );
};
