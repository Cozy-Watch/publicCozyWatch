import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LicenseModal } from "../../components/LicenseModal/LicenseModal";
import { LicenseStatusCard } from "../../components/LicenseStatus/LicenseStatusCard";
import {
  licenseStatusQueryKey,
  useLicenseStatusQuery,
} from "../../api/useLicenseStatusQuery";
import { SettingsSection } from "./SettingsSection";

export const LicenseSettings = () => {
  const [isLicenseModalOpen, setIsLicenseModalOpen] = useState(false);
  const [licenseActionError, setLicenseActionError] = useState<string | null>(
    null,
  );
  const [isLicenseActionPending, setIsLicenseActionPending] = useState(false);
  const { data: licenseState, isPending: isLicenseStatusPending } =
    useLicenseStatusQuery();
  const queryClient = useQueryClient();

  const runLicenseAction = async (action: () => Promise<unknown>) => {
    setLicenseActionError(null);
    setIsLicenseActionPending(true);

    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: licenseStatusQueryKey });
    } catch (error) {
      setLicenseActionError(
        error instanceof Error
          ? error.message
          : "Unable to update license status. Please try again.",
      );
    } finally {
      setIsLicenseActionPending(false);
    }
  };

  return (
    <SettingsSection>
      <LicenseStatusCard
        state={licenseState}
        isPending={isLicenseStatusPending || isLicenseActionPending}
        error={licenseActionError}
        onChoosePersonalUse={() =>
          runLicenseAction(() =>
            window.electronAPI.license.setUsage("personal"),
          )
        }
        onStartCommercialTrial={() =>
          runLicenseAction(() =>
            window.electronAPI.license.setUsage("commercial"),
          )
        }
        onOpenLicenseModal={() => setIsLicenseModalOpen(true)}
        onDeactivate={() => {
          if (
            window.confirm(
              "Deactivate this Mac? You can then activate the license on another device.",
            )
          ) {
            return runLicenseAction(() =>
              window.electronAPI.license.deactivate(),
            );
          }
        }}
      />
      <LicenseModal
        isOpen={isLicenseModalOpen}
        onClose={() => setIsLicenseModalOpen(false)}
      />
    </SettingsSection>
  );
};
