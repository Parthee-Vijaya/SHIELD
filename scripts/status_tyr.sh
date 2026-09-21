#!/usr/bin/env bash
# Vis status på Tyr-processer + sundhedstjek.
# Read-only — ingen ændringer.

set -uo pipefail

PIDDIR="${TYR_PIDDIR:-$HOME/.tyr/run}"
API_PORT="${API_PORT:-8001}"
FRONTEND_PORT="${FRONTEND_PORT:-8090}"

show_proc() {
    local label="$1"
    local pidfile="$2"
    local port="$3"
    if [[ -f "$pidfile" ]]; then
        local pid
        pid="$(cat "$pidfile" 2>/dev/null)"
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            echo "[$label] kører som pid $pid (port $port)"
        else
            echo "[$label] pidfile findes men pid $pid kører ikke"
        fi
    else
        echo "[$label] ingen pidfile"
    fi
}

show_proc "backend " "$PIDDIR/backend.pid" "$API_PORT"
show_proc "frontend" "$PIDDIR/frontend.pid" "$FRONTEND_PORT"

echo ""
echo "Sundhedstjek (backend):"
if curl -s -o /tmp/_tyr_health.json -w "  /health: %{http_code} (%{time_total}s)\n" "http://localhost:$API_PORT/health" 2>/dev/null; then
    if command -v jq >/dev/null 2>&1; then
        jq -r '"  status: \(.status)"' /tmp/_tyr_health.json 2>/dev/null || true
        jq -r '.services | to_entries[] | "  - \(.key): \(.value)"' /tmp/_tyr_health.json 2>/dev/null || true
    fi
    rm -f /tmp/_tyr_health.json
else
    echo "  /health: ikke tilgængelig"
fi

echo ""
echo "Frontend:"
if curl -s -o /dev/null -w "  /: %{http_code} (%{time_total}s)\n" "http://localhost:$FRONTEND_PORT/" 2>/dev/null; then
    :
else
    echo "  /: ikke tilgængelig"
fi
