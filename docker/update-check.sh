# Sourced by start.sh. The update reminder: the app container asks GitHub for
# the latest release now and then, and leaves the answer in the web root as
# /update.json for the frontend to compare with the version it is running.
#
# Done here rather than in each browser so that the people using an instance
# never contact GitHub themselves, and an instance makes one small request
# every few hours no matter how many people use it. Nothing about the instance
# or its users is sent: it is a plain GET of a public URL.
#
# Settings (all optional):
#   UPDATE_CHECK=off            no requests at all, no reminder
#   SYLLABASE_BUILD_VERSION     baked into the image at build time (the release tag)
#   SYLLABASE_REPO              owner/name of the repository releases come from
#   UPDATE_CHECK_API            base URL of the GitHub API (tests point it at a file)

# Validates the settings and sets UPDATE_CHECK_ENABLED (true/false),
# SYLLABASE_BUILD_VERSION and SYLLABASE_REPO.
update_check_settings() {
  case "$(printf '%s' "${UPDATE_CHECK:-on}" | tr '[:upper:]' '[:lower:]')" in
    ""|on|true|1|yes) UPDATE_CHECK_ENABLED=true ;;
    off|false|0|no) UPDATE_CHECK_ENABLED=false ;;
    *) fail "UPDATE_CHECK must be on or off (got '${UPDATE_CHECK}')." ;;
  esac

  SYLLABASE_BUILD_VERSION="${SYLLABASE_BUILD_VERSION:-dev}"
  # Both end up inside a JavaScript string in env.js and in URLs, so only
  # allow the characters a tag or a repository name can actually have.
  printf '%s' "$SYLLABASE_BUILD_VERSION" | grep -Eq '^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$' \
    || fail "SYLLABASE_BUILD_VERSION '${SYLLABASE_BUILD_VERSION}' is not a version (expected something like v1.2.3)."

  SYLLABASE_REPO="${SYLLABASE_REPO:-OwenWright8/syllabase}"
  printf '%s' "$SYLLABASE_REPO" | grep -Eq '^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$' \
    || fail "SYLLABASE_REPO must look like owner/name (got '${SYLLABASE_REPO}')."
}

# Fetches the latest release once and writes it to $1, replacing the file only
# when the answer is a well-formed release (a failed or odd response keeps the
# last good one). Returns non-zero on failure; callers ignore that.
update_check_once() {
  out="$1"
  tmp="$out.tmp.$$"
  api="${UPDATE_CHECK_API:-https://api.github.com}"
  # /releases/latest skips drafts and pre-releases, which is what a reminder wants.
  if curl -fsS --max-time 20 --proto '=https,file' \
       -H 'Accept: application/vnd.github+json' -H 'User-Agent: syllabase-update-check' \
       "$api/repos/$SYLLABASE_REPO/releases/latest" 2>/dev/null \
     | python3 -c '
import json, re, sys
release = json.load(sys.stdin)
tag, url = release.get("tag_name"), release.get("html_url")
if not isinstance(tag, str) or not re.fullmatch(r"v?\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?", tag):
    sys.exit("no usable tag")
if not isinstance(url, str) or not url.startswith("https://github.com/"):
    sys.exit("no usable release URL")
name = release.get("name") if isinstance(release.get("name"), str) else ""
published = release.get("published_at") if isinstance(release.get("published_at"), str) else ""
json.dump({"latest": tag, "url": url, "name": name[:200], "published_at": published}, sys.stdout)
' > "$tmp" 2>/dev/null; then
    chmod 644 "$tmp"
    mv "$tmp" "$out"
  else
    rm -f "$tmp"
    return 1
  fi
}
