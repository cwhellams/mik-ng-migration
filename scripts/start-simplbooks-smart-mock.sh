#!/usr/bin/env bash
# Start the SimplBooks Smart Mock server.
#
# Unlike the Prism-based mock (start-simplbooks-mock-server.sh) this server:
#   - Maintains in-memory state (clients, invoices persist across requests)
#   - Generates a real PDF for every invoice
#   - Emails the PDF when invoices/sent is called (if SMTP is configured)
#   - Serves articles from the OpenAPI fixture YAML
#
# The backend .env is read automatically for SMTP and DISABLE_EMAIL_SENDING.
#
# Usage:
#   ./scripts/start-simplbooks-smart-mock.sh
#
# Then ensure apps/backend/.env contains:
#   SIMPLBOOKS_BASE_URI=http://127.0.0.1:4010

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  SimplBooks Smart Mock"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  Listening : http://127.0.0.1:4010"
echo "  PDF       : generated per invoice"
echo "  Email     : controlled by DISABLE_EMAIL_SENDING in backend .env"
echo ""
echo "  Make sure apps/backend/.env has:"
echo "    SIMPLBOOKS_BASE_URI=http://127.0.0.1:4010"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""

# Kill any process already using port 4010
if command -v powershell.exe &>/dev/null; then
  powershell.exe -Command "Get-NetTCPConnection -LocalPort 4010 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -ErrorAction SilentlyContinue }" 2>/dev/null || true
elif command -v fuser &>/dev/null; then
  fuser -k 4010/tcp 2>/dev/null || true
fi

# simplbooks/ is not a pnpm workspace member — run node directly
cd "$REPO_ROOT/simplbooks"
exec node --experimental-transform-types src/mock-server.ts
