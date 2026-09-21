#!/usr/bin/env bash
# Start Tyr backend i production-mode (uden --reload).
#
# - Aktiverer venv
# - Sætter API_RELOAD=false + API_HOST=0.0.0.0 så Tailscale virker
# - Skriver PID til ~/.tyr/run/backend.pid
# - Logger til ~/Library/Logs/Tyr/backend.console.log (loguru-strukturen
#   skriver allerede til backend.log via observability-modulet)
#
# Tjekker om backend allerede kører før start. Idempotent — `start_backend.sh`
# to gange er ikke farligt.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIDDIR="${TYR_PIDDIR:-$HOME/.tyr/run}"
LOGDIR="${TYR_LOG_DIR:-$HOME/Library/Logs/Tyr}"
PIDFILE="$PIDDIR/backend.pid"
CONSOLE_LOG="$LOGDIR/backend.console.log"

mkdir -p "$PIDDIR" "$LOGDIR"

# Tjek om en backend allerede kører på den konfigurerede port
PORT="${API_PORT:-8001}"
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Backend kører allerede på port $PORT — stop den først med scripts/stop_tyr.sh"
    exit 1
fi

# Tjek venv
if [[ ! -x "$ROOT/venv/bin/python" ]]; then
    echo "venv ikke fundet på $ROOT/venv — opret den først:"
    echo "  cd $ROOT && python3.11 -m venv venv && venv/bin/pip install -r requirements.txt"
    exit 1
fi

cd "$ROOT"

# Production-mode env. Disse overrider hvad der måtte være i .env hvis de er sat.
export API_RELOAD=false
export API_HOST="${API_HOST:-0.0.0.0}"

echo "Starter backend på $API_HOST:$PORT (reload=false)..."
echo "Console log → $CONSOLE_LOG"

# nohup + & så scriptet ikke binder terminalen.
nohup "$ROOT/venv/bin/python" main.py >> "$CONSOLE_LOG" 2>&1 &
PID=$!
echo "$PID" > "$PIDFILE"

# Kort grace period for at se om processen overlever opstart
sleep 2
if ! kill -0 "$PID" 2>/dev/null; then
    echo "Backend startede ikke (pid $PID døde inden 2s). Tjek $CONSOLE_LOG"
    rm -f "$PIDFILE"
    exit 1
fi

echo "Backend startet (pid $PID)"
echo "Sundhedstjek: curl http://localhost:$PORT/health"
