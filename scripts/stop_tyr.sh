#!/usr/bin/env bash
# Stop Tyr backend + frontend ved brug af PIDs i ~/.tyr/run/
#
# Idempotent — kører fint selv hvis intet kører. Bruges til at slukke
# manuelt før genstart eller log-kig.

set -uo pipefail

PIDDIR="${TYR_PIDDIR:-$HOME/.tyr/run}"

stop_pid() {
    local label="$1"
    local pidfile="$2"
    if [[ ! -f "$pidfile" ]]; then
        echo "[$label] ingen pidfile på $pidfile — springer over"
        return
    fi
    local pid
    pid="$(cat "$pidfile" 2>/dev/null || echo '')"
    if [[ -z "$pid" ]]; then
        echo "[$label] tom pidfile — fjerner"
        rm -f "$pidfile"
        return
    fi
    if kill -0 "$pid" 2>/dev/null; then
        echo "[$label] sender SIGTERM til pid $pid"
        kill "$pid" 2>/dev/null || true
        # Vent op til 8 sekunder på pænt exit
        for _ in 1 2 3 4 5 6 7 8; do
            sleep 1
            if ! kill -0 "$pid" 2>/dev/null; then
                echo "[$label] stoppet"
                rm -f "$pidfile"
                return
            fi
        done
        echo "[$label] ikke stoppet — sender SIGKILL"
        kill -9 "$pid" 2>/dev/null || true
        rm -f "$pidfile"
    else
        echo "[$label] pid $pid ikke aktiv — fjerner pidfile"
        rm -f "$pidfile"
    fi
}

stop_pid "backend" "$PIDDIR/backend.pid"
stop_pid "frontend" "$PIDDIR/frontend.pid"

echo "Tyr stoppet."
