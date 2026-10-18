// Which release this is, and whether a newer one is out.
//
// Both come from the app container: the version is baked into the image and
// written into /env.js by start.sh, and /update.json is the latest release as
// the container last saw it on GitHub (docker/update-check.sh). Browsers never
// ask GitHub themselves. Outside the Docker image (`npm run dev`) the version
// is "dev" and there is no update.json.

const DEFAULT_REPO = "OwenWright8/syllabase";

// (Guarded so the pure helpers below can also be imported outside a browser.)
// (The type is spelled out here because the e2e specs import this file without runtimeConfig.ts.)
const runtime = typeof window === "undefined" ? undefined : (window as { __ENV__?: Record<string, string> }).__ENV__;

export const APP_VERSION: string = runtime?.APP_VERSION || "dev";

/** owner/name of the repository releases come from (a fork sets its own). */
export const APP_REPO: string = /^[\w.-]+\/[\w.-]+$/.test(runtime?.APP_REPO ?? "") ? runtime!.APP_REPO : DEFAULT_REPO;

export const REPO_URL = `https://github.com/${APP_REPO}`;

interface Version {
  core: [number, number, number];
  pre: string | null;
}

/** "v1.2.3" / "1.2.3-rc.1" → its parts; anything else (e.g. "dev") → null. */
export function parseVersion(text: string): Version | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(text.trim());
  if (!match) return null;
  return { core: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] ?? null };
}

/** Semver order: negative if a < b, positive if a > b, 0 if equal. A pre-release comes before its release. */
export function compareVersions(a: Version, b: Version): number {
  for (let i = 0; i < 3; i++) if (a.core[i] !== b.core[i]) return a.core[i] - b.core[i];
  if (a.pre === b.pre) return 0;
  if (a.pre === null) return 1;
  if (b.pre === null) return -1;
  const left = a.pre.split(".");
  const right = b.pre.split(".");
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if (left[i] === undefined) return -1;
    if (right[i] === undefined) return 1;
    const x = /^\d+$/.test(left[i]) ? Number(left[i]) : NaN;
    const y = /^\d+$/.test(right[i]) ? Number(right[i]) : NaN;
    if (!isNaN(x) && !isNaN(y)) {
      if (x !== y) return x - y;
    } else if (left[i] !== right[i]) {
      if (!isNaN(x)) return -1; // numeric identifiers sort before alphanumeric ones
      if (!isNaN(y)) return 1;
      return left[i] < right[i] ? -1 : 1;
    }
  }
  return 0;
}

/** True only when both are real versions and `latest` is newer than `current`. A dev build never nags. */
export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  return !!a && !!b && compareVersions(a, b) > 0;
}

/** "v1.2.3" whichever way it was written. */
export const displayVersion = (text: string) => (parseVersion(text) ? `v${text.replace(/^v/, "")}` : text);

/** The release notes for one version. */
export const releaseNotesUrl = (version: string) => `${REPO_URL}/releases/tag/${encodeURIComponent(displayVersion(version))}`;

export interface LatestRelease {
  latest: string;
  /** The release's page on GitHub: its notes. */
  url: string;
  name: string;
  published_at: string;
}

/** The container's last look at GitHub, or null if the check is off, hasn't run, or isn't there (dev). */
export async function fetchLatestRelease(): Promise<LatestRelease | null> {
  let response: Response;
  try {
    response = await fetch("/update.json", { cache: "no-store" });
  } catch {
    return null;
  }
  // The dev server answers unknown paths with index.html, so check it's JSON at all.
  if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json")) return null;
  try {
    const data = (await response.json()) as Partial<LatestRelease>;
    if (typeof data.latest !== "string" || !parseVersion(data.latest)) return null;
    if (typeof data.url !== "string" || !data.url.startsWith("https://github.com/")) return null;
    return {
      latest: data.latest,
      url: data.url,
      name: typeof data.name === "string" ? data.name : "",
      published_at: typeof data.published_at === "string" ? data.published_at : "",
    };
  } catch {
    return null;
  }
}
