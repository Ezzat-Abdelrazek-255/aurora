#!/usr/bin/env bash
# Register the Supabase MCP server with Claude Code, reading the token from a
# file so it never appears on the command line, in shell history, or in chat.
#
# Usage:
#   1) Save your token (just the sbp_... value, no quotes) to /tmp/sb-token
#        e.g.  nano /tmp/sb-token   →  paste, save, exit
#   2) Run:    bash scripts/register-supabase-mcp.sh
#
# The script tries the simplest registration first (npx --yes), falls back to
# a global install if that fails, verifies the result, and shreds the token
# file when done.

set -euo pipefail

TOKEN_FILE="${1:-/tmp/sb-token}"

if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "✗ Token file not found: $TOKEN_FILE" >&2
  echo "" >&2
  echo "Save your Supabase personal-access token to that path first:" >&2
  echo "  nano $TOKEN_FILE     # paste the sbp_... value, save, exit" >&2
  exit 1
fi

# strip whitespace and CR/LF
TOKEN=$(tr -d '[:space:]\r\n' < "$TOKEN_FILE")

if [[ -z "$TOKEN" ]]; then
  echo "✗ Token file is empty: $TOKEN_FILE" >&2
  exit 1
fi

if [[ ! "$TOKEN" =~ ^sbp_ ]]; then
  echo "! Token doesn't start with 'sbp_'. Continuing, but double-check it." >&2
fi

cleanup_token() {
  if command -v shred >/dev/null 2>&1; then
    shred -u "$TOKEN_FILE" 2>/dev/null || rm -f "$TOKEN_FILE"
  else
    rm -f "$TOKEN_FILE"
  fi
}
trap cleanup_token EXIT

echo "→ Removing any existing 'supabase' MCP registration (idempotent)"
claude mcp remove supabase 2>/dev/null || true

echo "→ Attempt 1: register via 'npx --yes'"
if claude mcp add supabase \
    -e "SUPABASE_ACCESS_TOKEN=$TOKEN" \
    -- npx --yes @supabase/mcp-server-supabase@latest; then
  echo "  registration command exited 0"
else
  echo "  ↳ failed; falling back to global install"
  npm install -g @supabase/mcp-server-supabase
  claude mcp remove supabase 2>/dev/null || true
  claude mcp add supabase \
    -e "SUPABASE_ACCESS_TOKEN=$TOKEN" \
    -- mcp-server-supabase
fi

echo "→ Verifying"
if claude mcp list 2>&1 | grep -qi 'supabase'; then
  echo "✓ Registered:"
  claude mcp list 2>&1 | grep -i 'supabase'
else
  echo "✗ MCP not in list. Full output:" >&2
  claude mcp list >&2
  exit 1
fi

echo ""
echo "✓ Token file wiped. Restart this Claude Code session for the new tools to load."
