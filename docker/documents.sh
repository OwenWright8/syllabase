#!/bin/sh
# Sourced by start.sh (POSIX sh; needs its `fail`). Turns the optional
# DOCUMENT* settings into validated values for the document_limits table, so a
# typo stops the container with a clear message instead of reaching the database.
#
#   DOCUMENTS               on (default) | off: uploads, and the worker that processes them
#   DOCUMENT_MAX_FILE_MB    largest single file             (default 200, or "unlimited")
#   DOCUMENT_USER_QUOTA_MB  total per user across all files (default 1024, or "unlimited")
#   DOCUMENT_MAX_PAGES      most pages a PDF may have       (default 1500, or "unlimited")
#   DOCUMENT_MAX_COUNT      most documents per user         (default 200, or "unlimited")
#
# "unlimited" isn't a special case in the database: it is stored as a number so
# far above anything real (1 petabyte, a million pages) that it never applies,
# and the app recognises it to say "no limit" rather than show the number.

DOC_UNLIMITED_BYTES=1000000000000000
DOC_UNLIMITED_PAGES=1000000
DOC_UNLIMITED_COUNT=1000000

# doc_is_unlimited NAME — true if NAME is set to "unlimited" (any case).
doc_is_unlimited() {
  eval "_raw=\${$1:-}"
  [ "$(printf '%s' "$_raw" | tr 'A-Z' 'a-z')" = unlimited ]
}

# doc_positive_int NAME DEFAULT MAX — print NAME's value as a plain integer in [1, MAX].
doc_positive_int() {
  _name="$1"
  _default="$2"
  _max="$3"
  eval "_value=\${$_name:-$_default}"
  case "$_value" in
    ''|*[!0-9]*) fail "$_name must be a whole number (got: '$_value')." ;;
  esac
  # expr strips leading zeros: `$((08))` would be read as (invalid) octal by dash.
  _value=$(expr "$_value" + 0) || fail "$_name is not a usable number (got: '$_value')."
  if [ "$_value" -lt 1 ] || [ "$_value" -gt "$_max" ]; then
    fail "$_name must be between 1 and $_max (got: $_value)."
  fi
  printf '%s' "$_value"
}

# documents_settings — sets DOC_ENABLED (true|false) and the four limits.
documents_settings() {
  case "$(printf '%s' "${DOCUMENTS:-on}" | tr 'A-Z' 'a-z')" in
    on|true|1|yes) DOC_ENABLED=true ;;
    off|false|0|no) DOC_ENABLED=false ;;
    *) fail "DOCUMENTS must be on or off (got: '${DOCUMENTS}')." ;;
  esac

  _file_mb=""
  _quota_mb=""
  if doc_is_unlimited DOCUMENT_MAX_FILE_MB; then
    DOC_MAX_FILE_BYTES=$DOC_UNLIMITED_BYTES
  else
    _file_mb=$(doc_positive_int DOCUMENT_MAX_FILE_MB 200 100000)
    DOC_MAX_FILE_BYTES=$((_file_mb * 1048576))
  fi
  if doc_is_unlimited DOCUMENT_USER_QUOTA_MB; then
    DOC_USER_QUOTA_BYTES=$DOC_UNLIMITED_BYTES
  else
    _quota_mb=$(doc_positive_int DOCUMENT_USER_QUOTA_MB 1024 100000000)
    DOC_USER_QUOTA_BYTES=$((_quota_mb * 1048576))
  fi
  if doc_is_unlimited DOCUMENT_MAX_PAGES; then
    DOC_MAX_PAGES=$DOC_UNLIMITED_PAGES
  else
    DOC_MAX_PAGES=$(doc_positive_int DOCUMENT_MAX_PAGES 1500 100000)
  fi
  if doc_is_unlimited DOCUMENT_MAX_COUNT; then
    DOC_MAX_COUNT=$DOC_UNLIMITED_COUNT
  else
    DOC_MAX_COUNT=$(doc_positive_int DOCUMENT_MAX_COUNT 200 100000)
  fi

  # A file bigger than the whole quota could never be stored (only checked when both are numbers).
  if [ -n "$_file_mb" ] && [ -n "$_quota_mb" ] && [ "$_file_mb" -gt "$_quota_mb" ]; then
    fail "DOCUMENT_MAX_FILE_MB ($_file_mb) can't be larger than DOCUMENT_USER_QUOTA_MB ($_quota_mb)."
  fi
}
