#!/usr/bin/env bash
# Read the Supabase service-role key from a file and write it into .env.local,
# then shred the file. Keeps the secret out of chat and shell history.
#
# Usage:
#   1) nano /tmp/sb-service-role     # paste the eyJ... or sb_secret_... value
#   2) bash scripts/set-service-role.sh

set -euo pipefail

KEY_FILE="${1:-/tmp/sb-service-role}"
ENV_FILE="$(dirname "$0")/../.env.local"

if [[ ! -f "$KEY_FILE" ]]; then
  echo "✗ Key file not found: $KEY_FILE" >&2
  echo "Save the service_role key there first (nano $KEY_FILE)" >&2
  exit 1
fi

KEY=$(tr -d '[:space:]\r\n' < "$KEY_FILE")
if [[ -z "$KEY" ]]; then
  echo "✗ Key file is empty" >&2
  exit 1
fi

# Strip a trailing blank "SUPABASE_SERVICE_ROLE_KEY=" if present, then append.
TMP=$(mktemp)
grep -v '^SUPABASE_SERVICE_ROLE_KEY=' "$ENV_FILE" > "$TMP" || true
mv "$TMP" "$ENV_FILE"
echo "SUPABASE_SERVICE_ROLE_KEY=$KEY" >> "$ENV_FILE"

# Wipe the input file
if command -v shred >/dev/null 2>&1; then
  shred -u "$KEY_FILE"
else
  rm -f "$KEY_FILE"
fi

echo "✓ SUPABASE_SERVICE_ROLE_KEY written to .env.local"
echo "✓ Source file wiped"
