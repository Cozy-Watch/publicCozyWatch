import { Flex } from "@radix-ui/themes";
import type { ReactNode } from "react";

export const SettingsSection = ({ children }: { children: ReactNode }) => (
  <Flex
    direction="column"
    height="100%"
    minHeight="0"
    minWidth="0"
    width="100%"
    flexGrow="1"
    overflowY="auto"
    overflowX="hidden"
  >
    <Flex
      direction="column"
      align="stretch"
      gap="4"
      p="4"
      width="100%"
      flexGrow="1"
    >
      {children}
    </Flex>
  </Flex>
);
