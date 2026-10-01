import { useQuery } from "@tanstack/react-query";
import { DEFAULT_ACCENT_COLOR } from "../../../../shared/theme";

export const accentColorQueryKey = ["settings", "accentColor"];

export const useAccentColorQuery = () =>
  useQuery({
    queryKey: accentColorQueryKey,
    queryFn: () => window.electronAPI.application.getApplicationAccentColor(),
    initialData: DEFAULT_ACCENT_COLOR,
  });
