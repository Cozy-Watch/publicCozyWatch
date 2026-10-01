import { ChatBubbleIcon } from "@radix-ui/react-icons";
import { LinkExternalIcon } from "@primer/octicons-react";
import { Button, Card, Flex, Text } from "@radix-ui/themes";
import { SettingsSection } from "./SettingsSection";

export const FeedbackSettings = () => (
  <SettingsSection>
    <Card className="settings-card">
      <Flex align="center" justify="between" gap="3">
        <Text className="settings-card-title">Feedback</Text>
        <Button
          style={{ width: 180 }}
          variant="outline"
          onClick={() => {
            window.electronAPI.openExternalLink("mailto:tiago@cozywatch.com");
          }}
        >
          Let’s chat
          <ChatBubbleIcon />
        </Button>
      </Flex>
    </Card>
    <Card className="settings-card">
      <Flex align="center" justify="between" gap="3">
        <Text className="settings-card-title">See what’s new</Text>
        <Button
          style={{ width: 180 }}
          variant="outline"
          onClick={() => {
            window.electronAPI.openExternalLink(
              "https://www.cozywatch.com/changelog/",
            );
          }}
        >
          Open Release Notes
          <LinkExternalIcon size={12} />
        </Button>
      </Flex>
    </Card>
  </SettingsSection>
);
