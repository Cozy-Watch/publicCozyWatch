import { MarkGithubIcon } from "@primer/octicons-react";
import {
  Badge,
  Button,
  Callout,
  Flex,
  Spinner,
  Tabs,
} from "@radix-ui/themes";
import { useIsAuthenticatedQuery } from "../../api/useIsAuthenticatedQuery";
import { useState } from "react";
import { Header } from "./components/Header/Header";
import { HeaderEmpty } from "./components/Header/Header.empty";
import { My } from "./Tabs/My/My";
import { Team } from "./Tabs/Team/Team";
import { useMenubar } from "./useMenubar";
import { useMenubarDensityQuery } from "../AppSettings/api/useMenubarDensityQuery";

export const Menubar = () => {
  const [selectedTab, setSelectedTab] = useState<"mine" | "team">("mine");
  const { error, data, isPending } = useMenubar();
  const { data: isAuthenticated } = useIsAuthenticatedQuery();
  const { data: menubarDensity } = useMenubarDensityQuery();
  const isCompact = menubarDensity === "compact";

  if (isPending || isAuthenticated === false) {
    return (
      <Flex direction="column" height="100%" flexGrow="1" overflow="hidden">
        <Flex
          direction="column"
          justify="between"
          flexShrink="0"
          height={isCompact ? "90px" : "100px"}
          pt={isCompact ? "2" : "3"}
          px={isCompact ? "2" : "3"}
        >
          <HeaderEmpty isCompact={isCompact} />
        </Flex>

        <Flex
          direction="column"
          flexGrow="1"
          minHeight="0"
          align="center"
          justify="center"
        >
          {isAuthenticated === false ? (
            <Button
              variant="soft"
              className="inverse-accent-text-shadow"
              onClick={() => {
                window.electronAPI.application.navigateToRoute("signIn");
              }}
            >
              <MarkGithubIcon size={16} />
              Sign In to Github
            </Button>
          ) : (
            <Spinner size="3" />
          )}
        </Flex>
      </Flex>
    );
  }

  if (error) {
    return (
      <Flex
        direction="column"
        height="100%"
        width="100%"
        flexGrow="1"
        overflow="hidden"
      >
        <Flex
          direction="column"
          justify="between"
          height="100px"
          flexShrink="0"
          pt="5"
          px="5"
        >
          <HeaderEmpty isCompact={false} />
        </Flex>

        <Flex
          direction="column"
          flexGrow="1"
          minHeight="0"
          width="100%"
          align="center"
          justify="center"
        >
          <Callout.Root>
            <Callout.Text>{error.message}</Callout.Text>
          </Callout.Root>
        </Flex>
      </Flex>
    );
  }

  if (!data) {
    return null;
  }

  const { headerData, myPullRequests, teamPullRequests } = data;
  const { avatarUrl, name, login } = headerData;

  return (
    <Tabs.Root
      value={selectedTab}
      onValueChange={(value) => {
        if (value === "mine" || value === "team") setSelectedTab(value);
      }}
      asChild
    >
      <Flex direction="column" height="100%" overflow="hidden">
        <Flex
          direction="column"
          justify="between"
          flexShrink="0"
          height={isCompact ? "90px" : "100px"}
          pt={isCompact ? "2" : "3"}
          px={isCompact ? "2" : "3"}
        >
          <Header
            avatarUrl={avatarUrl}
            name={name}
            login={login}
            isCompact={isCompact}
          />

          <Tabs.List
            className="menubar-classic-tabs"
            data-density={isCompact ? "compact" : "standard"}
            size={isCompact ? "1" : "2"}
          >
            <Tabs.Trigger
              className="menubar-classic-tab"
              value="mine"
            >
              My Pull Requests
              <Badge ml="1" size="1">
                {myPullRequests.length > 99 ? "99+" : myPullRequests.length}
              </Badge>
            </Tabs.Trigger>
            <Tabs.Trigger
              className="menubar-classic-tab"
              value="team"
            >
              Relevant Pull Requests
              <Badge ml="1" size="1">
                {teamPullRequests.length > 99 ? "99+" : teamPullRequests.length}
              </Badge>
            </Tabs.Trigger>
          </Tabs.List>
        </Flex>

        <Tabs.Content value="mine" asChild>
          <Flex
            direction="column"
            className="menubar-classic-panel"
            flexGrow="1"
            minHeight="0"
            overflowY="auto"
            overflowX="hidden"
          >
            {selectedTab === "mine" ? (
              <My pullRequests={myPullRequests} isCompact={isCompact} />
            ) : null}
          </Flex>
        </Tabs.Content>
        <Tabs.Content value="team" asChild>
          <Flex
            direction="column"
            className="menubar-classic-panel"
            flexGrow="1"
            minHeight="0"
            overflowY="auto"
            overflowX="hidden"
          >
            {selectedTab === "team" ? (
              <Team pullRequests={teamPullRequests} isCompact={isCompact} />
            ) : null}
          </Flex>
        </Tabs.Content>
      </Flex>
    </Tabs.Root>
  );
};
