import { Cross1Icon, MagnifyingGlassIcon } from "@radix-ui/react-icons";
import {
  Box,
  Button,
  Checkbox,
  Flex,
  IconButton,
  Text,
  TextField,
} from "@radix-ui/themes";
import { useState } from "react";
import { Repository } from "src/mainProcess/safeStorage/safeStorage.types";
import { ErrorMessage } from "../../components/ErrorMessage/ErrorMessage";
import { useActiveRepositoriesMutation } from "./api/useActiveRepositoriesMutation";
import { List } from "./components/List/List";
import { Modal } from "./components/Modal/Modal";
import { useRepositories } from "./useRepositories";

export const Repositories = () => {
  const { isPending, error, data } = useRepositories();

  if (isPending) {
    return (
      <Flex
        flexGrow="1"
        height="100%"
        minHeight="0"
        justify="center"
        align="center"
      >
        <img
          id="sofa"
          src="./images/catSitting.png"
          width="150"
          className="imageStroke"
        />
      </Flex>
    );
  }

  if (error) {
    return (
      <Box mt="6">
        <ErrorMessage message={error.message} />
      </Box>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <RepositoriesContent
      repositories={data.repositories}
      activeRepositories={data.activeRepositories}
      groupByOwner={data.groupByOwner}
    />
  );
};

interface Props {
  repositories: Repository[];
  activeRepositories: Record<number, boolean>;
  groupByOwner: Record<string, Repository[]>;
}

const RepositoriesContent = ({
  repositories,
  activeRepositories,
  groupByOwner,
}: Props) => {
  const { mutateAsync: mutateActiveRepositories, isPending } =
    useActiveRepositoriesMutation();

  const [showWarningModal, setShowWarningModal] = useState(false);

  const [tempActiveRepositories, setTempActiveRepositories] =
    useState<Record<number, boolean>>(activeRepositories);

  const setActiveRepositories = (repoSelection: Record<number, boolean>) => {
    setTempActiveRepositories((state) => ({
      ...state,
      ...repoSelection,
    }));
  };

  const [textFilter, setTextFilter] = useState("");

  const isAllActive = Object.values(tempActiveRepositories).every(
    (value) => value
  );

  const activeRepositoriesCount = Object.values(tempActiveRepositories).filter(
    (value) => value
  ).length;

  return (
    <>
      <Flex
        direction="column"
        overflow="auto"
        height="100%"
        position="relative"
        pb="9"
      >
        <Flex
          direction="column"
          position="sticky"
          gap="2"
          top="0"
          px="4"
          pt="4"
          style={{
            borderRadius: "8px",
            backdropFilter: "blur(9px)",
            zIndex: 2,
            maskImage: `linear-gradient(to bottom,black 0% 100%,transparent 0% 100%)`,
          }}
        >
          <Flex justify="between" align="center">
            <Flex gap="3" direction="column">
              <Text size="2" className="settings-card-description">
                Manage repositories you want to monitor for pull requests.
              </Text>

            </Flex>

            <Flex justify={"end"} mt="2" mb="2" width="175px">
              <TextField.Root
                className="settings-search"
                placeholder="Search repository"
                value={textFilter}
                onChange={({ target: { value } }) => {
                  setTextFilter(value);
                }}
              >
                <TextField.Slot>
                  <MagnifyingGlassIcon height="16" width="16" />
                </TextField.Slot>

                <TextField.Slot pr="3">
                  <IconButton
                    size="1"
                    variant="ghost"
                    onClick={() => setTextFilter("")}
                  >
                    <Cross1Icon height="12" width="12" />
                  </IconButton>
                </TextField.Slot>
              </TextField.Root>
            </Flex>
          </Flex>

          <Flex justify="between" align="center" pb="4" mb="2">
            <Flex gap="2" align="center" px="4">
              <Flex pl="3">
                <Checkbox
                  checked={isAllActive}
                  onCheckedChange={(checked) => {
                    const updateAll = Object.keys(
                      tempActiveRepositories,
                    ).reduce((acc, key) => {
                      return {
                        ...acc,
                        [key]: checked,
                      };
                    }, {});

                    setActiveRepositories(updateAll);
                  }}
                />
              </Flex>

              <Text size="2" className="settings-control-label">
                {isAllActive ? "Deactivate" : "Activate"} All
              </Text>

              <Text size="2" className="settings-card-description">
                ({activeRepositoriesCount} of {repositories.length})
              </Text>
            </Flex>

            <Button
              className="settings-action"
              style={{ width: "175px" }}
              loading={isPending}
              onClick={() => {
                if (isAllActive || activeRepositoriesCount >= 15) {
                  return setShowWarningModal(true);
                }
                mutateActiveRepositories(tempActiveRepositories);
              }}
            >
              Save Changes
            </Button>
          </Flex>
        </Flex>

        <Flex width="100%" direction="column" gap="4" px="4" flexGrow="1">
          {Object.entries(groupByOwner)
            .filter(([, repos]) => {
              return repos.some((repo) =>
                repo.name.toLowerCase().includes(textFilter.toLowerCase())
              );
            })
            .map(([owner, repos]) => (
              <List
                key={owner}
                owner={owner}
                repos={repos}
                filter={textFilter.toLowerCase()}
                saveActiveRepositories={(repositorySetting) =>
                  setActiveRepositories(repositorySetting)
                }
                activeRepositories={tempActiveRepositories}
              />
            ))}
        </Flex>
      </Flex>

      <Modal
        isOpen={showWarningModal}
        onClose={() => {
          setShowWarningModal(false);
        }}
        loading={isPending}
        onSave={() => {
          mutateActiveRepositories(tempActiveRepositories);
          setShowWarningModal(false);
        }}
      />
    </>
  );
};
