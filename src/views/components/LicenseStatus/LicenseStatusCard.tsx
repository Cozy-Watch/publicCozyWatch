import { Button, Card, Flex, Text } from "@radix-ui/themes";
import type { LicenseState } from "../../../mainProcess/licensing/licenseState.types";
import { LicenseStatusBadge } from "./LicenseStatusBadge";
import {
  getTrialDaysRemaining,
  hasStartedCommercialTrial,
} from "./licenseStatus.utils";

interface Props {
  state?: LicenseState;
  isPending: boolean;
  error?: string | null;
  onChoosePersonalUse: () => void;
  onStartCommercialTrial: () => void;
  onOpenLicenseModal: () => void;
  onDeactivate: () => void;
}

export const LicenseStatusCard = ({
  state,
  isPending,
  error,
  onChoosePersonalUse,
  onStartCommercialTrial,
  onOpenLicenseModal,
  onDeactivate,
}: Props) => {
  const trialDaysRemaining = state ? getTrialDaysRemaining(state) : null;
  const canStartTrial = state ? !hasStartedCommercialTrial(state) : false;

  const description = (() => {
    switch (state?.status) {
      case "commercial-trial":
        return `${trialDaysRemaining ?? 0} day${trialDaysRemaining === 1 ? "" : "s"} left in your official-distribution trial.`;
      case "commercial-active":
        return state.licenseExpiresAt
          ? `Official-distribution benefits are active until ${new Date(state.licenseExpiresAt).toLocaleDateString()}.`
          : "Official-distribution benefits are active.";
      case "lifetime-active":
        return "Official-distribution benefits are active permanently.";
      case "expired":
        return "Your official-distribution trial or subscription has ended. MIT-licensed source-code rights are unaffected.";
      case "invalid":
        return "This official-distribution license needs attention. MIT-licensed source-code rights are unaffected.";
      case "personal":
        return "No official-distribution license is active. MIT-licensed source-code rights are unaffected.";
      case "unconfigured":
      default:
        return "Continue without official-distribution benefits or start a 30-day trial.";
    }
  })();

  return (
    <Card
      className="settings-card"
    >
      <Flex direction="column" gap="3">
        <Flex align="center" justify="between" gap="3">
          <Text className="settings-card-title">License</Text>
          <LicenseStatusBadge state={state} />
        </Flex>

        <Text size="2" className="settings-card-description">
          {description}
        </Text>

        {error && (
          <Text size="2" color="red">
            {error}
          </Text>
        )}

        <Flex align="center" gap="2">
          {state?.status === "unconfigured" && (
            <>
              <Button
                size="1"
                variant="soft"
                disabled={isPending}
                onClick={onChoosePersonalUse}
              >
                Personal use
              </Button>

              <Button
                size="1"
                disabled={isPending}
                onClick={onStartCommercialTrial}
              >
                Start 30-day official trial
              </Button>
            </>
          )}

          {state?.status === "personal" && canStartTrial && (
            <Button
              size="1"
              disabled={isPending}
              onClick={onStartCommercialTrial}
            >
              Start 30-day official trial
            </Button>
          )}

          {!state ||
          state.status === "unconfigured" ||
          state.status === "personal" ||
          state.status === "expired" ||
          state.status === "invalid" ? (
            <Button
              size="1"
              variant="outline"
              disabled={isPending}
              onClick={onOpenLicenseModal}
            >
              Enter or buy an official distribution license
            </Button>
          ) : null}

          {state?.status === "commercial-trial" && (
            <>
              <Button size="1" onClick={onOpenLicenseModal}>
                Enter license key
              </Button>

              <Button
                size="1"
                variant="outline"
                disabled={isPending}
                onClick={onChoosePersonalUse}
              >
                Use personally instead
              </Button>
            </>
          )}

          {(state?.status === "commercial-active" ||
            state?.status === "lifetime-active") && (
            <Button
              size="1"
              color="red"
              variant="soft"
              disabled={isPending}
              onClick={onDeactivate}
            >
              Deactivate this Mac
            </Button>
          )}
        </Flex>
      </Flex>
    </Card>
  );
};
