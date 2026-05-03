#!/usr/bin/env bash
# Swap .env.local's TRIGGER_SECRET_KEY (currently tr_dev_…) to the prod
# secret so the deployed task in the prod env can be invoked from the API.
#
# Usage:
#   1) nano /tmp/tr-prod-key   # paste the tr_prod_… value, save, exit
#   2) bash scripts/set-trigger-prod-key.sh
set -euo pipefail

KEY_FILE="${1:-/tmp/tr-prod-key}"
ENV_FILE="$(dirname "$0")/../.env.local"

if [[ ! -f "$KEY_FILE" ]]; then
  echo "✗ Key file not found: $KEY_FILE" >&2
  echo "  nano $KEY_FILE  # paste the tr_prod_... value" >&2
  exit 1
fi

KEY=$(tr -d '[:space:]\r\n' < "$KEY_FILE")
[[ -z "$KEY" ]] && { echo "✗ Key file empty"; exit 1; }
[[ ! "$KEY" =~ ^tr_prod_ ]] && echo "! Key doesn't start with 'tr_prod_' — continuing anyway"

TMP=$(mktemp)
grep -v '^TRIGGER_SECRET_KEY=' "$ENV_FILE" > "$TMP" || true
mv "$TMP" "$ENV_FILE"
echo "TRIGGER_SECRET_KEY=$KEY" >> "$ENV_FILE"

if command -v shred >/dev/null 2>&1; then shred -u "$KEY_FILE"; else rm -f "$KEY_FILE"; fi
echo "✓ TRIGGER_SECRET_KEY swapped to prod; key file wiped"
