import { ArrowUpCircle, CheckCircle2, ExternalLink, Github, Info } from "lucide-react";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import { REPO_URL, displayVersion, parseVersion, releaseNotesUrl } from "@/lib/version";

function ExternalA({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
      {children}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
    </a>
  );
}

/** Profile → About: which version this is, whether it's current, and where to read more. */
export function AboutSection() {
  const { current, release, isLoading, updateAvailable } = useUpdateCheck();
  const isRelease = !!parseVersion(current);

  let status: React.ReactNode;
  if (!isRelease) {
    status = <p className="text-sm text-muted-foreground">Development build: update checks are off.</p>;
  } else if (isLoading) {
    status = null;
  } else if (updateAvailable && release) {
    status = (
      <p className="flex items-center gap-1.5 text-sm text-foreground">
        <ArrowUpCircle className="h-4 w-4 text-primary" aria-hidden />
        {displayVersion(release.latest)} is available.
        <ExternalA href={release.url}>What's new</ExternalA>
      </p>
    );
  } else if (release) {
    status = (
      <p className="flex items-center gap-1.5 text-sm text-success">
        <CheckCircle2 className="h-4 w-4" aria-hidden />
        Up to date
      </p>
    );
  } else {
    status = (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Info className="h-4 w-4" aria-hidden />
        Not checking for updates (switched off with UPDATE_CHECK=off, or GitHub couldn't be reached yet).
      </p>
    );
  }

  return (
    <section aria-labelledby="about-heading" className="col-span-12 glass-strong rounded-2xl p-5">
      <h3 id="about-heading" className="text-lg font-semibold text-foreground mb-1">
        About
      </h3>
      <p className="text-xs text-muted-foreground mb-4">The version of Syllabase this server runs</p>
      <div className="space-y-3">
        <p className="text-sm">
          <span className="text-muted-foreground">Version</span>{" "}
          <span className="font-mono font-medium" data-testid="app-version">
            {displayVersion(current)}
          </span>
        </p>
        {status}
        <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
          {isRelease && <ExternalA href={releaseNotesUrl(current)}>Release notes for this version</ExternalA>}
          <ExternalA href={`${REPO_URL}/releases`}>All releases</ExternalA>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            <Github className="h-3.5 w-3.5" aria-hidden />
            Source code
          </a>
          <ExternalA href={`${REPO_URL}/issues/new/choose`}>Report a problem</ExternalA>
        </div>
      </div>
    </section>
  );
}
