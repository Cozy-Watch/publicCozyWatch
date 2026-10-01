import {
  Avatar,
  Box,
  Card,
  Checkbox,
  Flex,
  Grid,
  Text,
} from "@radix-ui/themes";
import { Repository } from "src/mainProcess/safeStorage/safeStorage.types";

interface Props {
  owner: string;
  repos: Repository[];
  filter: string;
  saveActiveRepositories: (repositorySetting: Record<number, boolean>) => void;
  activeRepositories: Record<number, boolean>;
}

export const List = ({
  owner,
  repos,
  filter,
  saveActiveRepositories,
  activeRepositories,
}: Props) => {
  const selectedRepos = repos.filter((repo) => activeRepositories[repo.id]);

  return (
    <Flex key={owner} width="100%" direction="column">
      <Card className="settings-card">
        <Flex width="100%" direction="column" gap="2">
          <Flex align="center" gap="4" px="4" pt="4">
            <Box>
              <Checkbox
                value={owner}
                size="2"
                checked={selectedRepos.length === repos.length}
                onCheckedChange={() => {
                  const allSelected = selectedRepos.length === repos.length;
                  const updates = repos.reduce(
                    (acc, repo) => {
                      acc[repo.id] = !allSelected;
                      return acc;
                    },
                    {} as Record<number, boolean>,
                  );
                  saveActiveRepositories(updates);
                }}
              />
            </Box>

            <Avatar size="1" src={repos[0].avatar} fallback={owner} />

            <Text className="settings-control-label">
              {owner} ({repos.length})
            </Text>
          </Flex>

          <Grid width="100%" columns={"1fr 1fr"} p="2" gap="3">
            {repos
              .filter((repo) => repo.name.toLowerCase().includes(filter))
              .map((repo) => {
                const isCherryPicked = activeRepositories[repo.id];

                return (
                  <Flex
                    align="center"
                    key={repo.id}
                    gap="4"
                    style={{ borderRadius: 10, background: "var(--gray-a2)" }}
                    p="2"
                  >
                    <Checkbox
                      value={repo.id}
                      checked={isCherryPicked}
                      size="2"
                      onCheckedChange={(checked) => {
                        saveActiveRepositories({
                          [repo.id]: checked as boolean,
                        });
                      }}
                    />
                    <Flex align="center" gap="3">
                      <Text className="settings-repository-name">{repo.name}</Text>
                    </Flex>
                  </Flex>
                );
              })}
          </Grid>
        </Flex>
      </Card>
    </Flex>
  );
};
