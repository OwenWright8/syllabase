#!/bin/sh
# Sourced by start.sh (POSIX sh; needs its `fail`). Turns the optional
# DOCUMENT* settings into validated values for the document_limits table, so a
# typo stops the container with a clear message instead of reaching the database.
#
#   DOCUMENTS               on (default) | off: uploads, and the worker that processes them
#   DOCUMENT_MAX_FILE_MB    largest single file            (default 200)
#   DOCUMENT_USER_QUOTA_MB  total per user across all files (default 1024)
#   DOCUMENT_MAX_PAGES      most pages a PDF may have       (default 1500)

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

# documents_settings — sets DOC_ENABLED (true|false) and the three limits.
documents_settings() {
  case "$(printf '%s' "${DOCUMENTS:-on}" | tr 'A-Z' 'a-z')" in
    on|true|1|yes) DOC_ENABLED=true ;;
    off|false|0|no) DOC_ENABLED=false ;;
    *) fail "DOCUMENTS must be on or off (got: '${DOCUMENTS}')." ;;
  esac
  _file_mb=$(doc_positive_int DOCUMENT_MAX_FILE_MB 200 100000)
  _quota_mb=$(doc_positive_int DOCUMENT_USER_QUOTA_MB 1024 1000000)
  DOC_MAX_PAGES=$(doc_positive_int DOCUMENT_MAX_PAGES 1500 100000)
  if [ "$_file_mb" -gt "$_quota_mb" ]; then
    fail "DOCUMENT_MAX_FILE_MB ($_file_mb) can't be larger than DOCUMENT_USER_QUOTA_MB ($_quota_mb)."
  fi
  DOC_MAX_FILE_BYTES=$((_file_mb * 1048576))
  DOC_USER_QUOTA_BYTES=$((_quota_mb * 1048576))
}
