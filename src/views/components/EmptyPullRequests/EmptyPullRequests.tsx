import { Flex, Text } from "@radix-ui/themes";

export const EmptyPullRequests = ({ message }: { message?: string }) => (
  <Flex align="center" direction="column" flexGrow="1" justify="center" gap="2" p="6">
    <img
      className="imageStroke"
      src="./images/catSitting.png"
      width="140"
      height="140"
      style={{ borderRadius: 10 }}
      alt=""
    />
    <Text weight="bold">All Caught up!</Text>
    {message && <Text color="gray">{message}</Text>}
  </Flex>
);
