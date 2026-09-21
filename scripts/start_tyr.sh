#!/usr/bin/env bash
# Start både backend og frontend i production-mode.
# Wrapper omkring start_backend.sh + start_frontend.sh.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT/scripts/start_backend.sh"
"$ROOT/scripts/start_frontend.sh"

echo ""
echo "Tyr kører:"
echo "  Backend:  http://localhost:${API_PORT:-8001}"
echo "  Frontend: http://localhost:${FRONTEND_PORT:-8090}"
echo ""
echo "Status: scripts/status_tyr.sh"
echo "Stop:   scripts/stop_tyr.sh"
