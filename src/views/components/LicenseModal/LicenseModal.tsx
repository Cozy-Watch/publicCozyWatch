import {
  Button,
  Callout,
  Dialog,
  Flex,
  Text,
  TextField,
} from "@radix-ui/themes";
import { useState } from "react";
import { LICENSE_URL } from "../BuyLicenseButton/BuyLicenseButton.meta";
import { useQueryClient } from "@tanstack/react-query";
import { licenseStatusQueryKey } from "../../api/useLicenseStatusQuery";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const LicenseModal = ({ isOpen, onClose }: Props) => {
  const [licenseKey, setLicenseKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isActivating, setIsActivating] = useState(false);

  const queryClient = useQueryClient();

  const activate = async () => {
    if (!licenseKey.trim()) {
      setError("Enter a license key.");
      return;
    }

    setError(null);
    setIsActivating(true);

    try {
      await window.electronAPI.license.activate(licenseKey);
      await queryClient.invalidateQueries({ queryKey: licenseStatusQueryKey });
      onClose();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to activate this license. Please try again.",
      );
    } finally {
      setIsActivating(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Content
        maxWidth="450px"
        style={{
          background:
            "linear-gradient(180deg,var(--accent-2) 70%, var(--accent-1) 100%)",
        }}
      >
        <Dialog.Title className="inverse-accent-text-shadow">
          Official Distribution License
        </Dialog.Title>

        {error && (
          <Callout.Root color="red">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        <Flex direction="column" gap="6" mt="4">
          <Text weight="light" size="2" className="inverse-accent-text-shadow">
            Cozy Watch source code is MIT licensed, including for commercial
            use. This optional license covers the official distribution and
            its associated licensing service and support.
          </Text>

          <Flex direction={"column"} gap="2">
            <label>
              <TextField.Root
                placeholder="Enter license key"
                value={licenseKey}
                onChange={({ target }) => {
                  setLicenseKey(target.value);
                }}
              />
            </label>
            <Button
              variant="soft"
              className="inverse-accent-text-shadow"
              size="3"
              disabled={!licenseKey.trim() || isActivating}
              loading={isActivating}
              onClick={activate}
            >
              Activate License
            </Button>
          </Flex>

          <Button
            color="green"
            className="inverse-accent-text-shadow"
            onClick={() => {
              window.electronAPI.openExternalLink(LICENSE_URL);
            }}
            size="3"
          >
            Buy an official distribution license
          </Button>
        </Flex>

        <Flex gap="3" mt="4" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </Dialog.Close>

        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};
