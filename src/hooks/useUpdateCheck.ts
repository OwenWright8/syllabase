import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { APP_VERSION, fetchLatestRelease, isNewer } from "@/lib/version";

const DISMISSED_KEY = "syllabase.dismissedUpdate";

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

/** The latest release, whether it is newer than this one, and whether this browser has dismissed the reminder for it. */
export function useUpdateCheck() {
  const { data: release = null, isLoading } = useQuery({
    queryKey: ["latest-release"],
    queryFn: fetchLatestRelease,
    // The container only looks every 12 hours, so there's no point asking often.
    staleTime: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const [dismissed, setDismissed] = useState(readDismissed);

  const updateAvailable = !!release && isNewer(release.latest, APP_VERSION);

  const dismiss = useCallback(() => {
    if (!release) return;
    try {
      localStorage.setItem(DISMISSED_KEY, release.latest);
    } catch {
      // Private mode or blocked storage: it just comes back next visit.
    }
    setDismissed(release.latest);
  }, [release]);

  return {
    current: APP_VERSION,
    release,
    isLoading,
    updateAvailable,
    /** Remembered per release: a newer one than the dismissed one shows again. */
    showReminder: updateAvailable && dismissed !== release?.latest,
    dismiss,
  };
}
