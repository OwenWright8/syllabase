import { ExternalLink, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import { displayVersion } from "@/lib/version";

/** A slim, dismissible note under the navigation bar when a newer release is out. */
export function UpdateBanner() {
  const { current, release, showReminder, dismiss } = useUpdateCheck();
  if (!showReminder || !release) return null;

  return (
    <div role="status" aria-label="Update available" className="border-b border-primary/20 bg-primary/10">
      <div className="container mx-auto px-4 py-2 flex items-center gap-3 text-sm">
        <Sparkles className="h-4 w-4 text-primary shrink-0" aria-hidden />
        <p className="flex-1 min-w-0 text-foreground">
          <span className="font-medium">Syllabase {displayVersion(release.latest)} is available.</span>{" "}
          <span className="text-muted-foreground">You're on {displayVersion(current)}.</span>
        </p>
        <a
          href={release.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline shrink-0"
        >
          What's new
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label="Dismiss update reminder" onClick={dismiss}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
