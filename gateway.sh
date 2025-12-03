#!/bin/bash
#
# Gateway lifecycle manager
# Usage: ./gateway.sh [start|stop|restart|status]
#
# This script manages the Gateway server process, handling restarts automatically
# when the server exits with code 0 (restart requested).
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/gateway.pid"
WRAPPER_PID_FILE="$SCRIPT_DIR/gateway-wrapper.pid"
LOG_FILE="$SCRIPT_DIR/logs/gateway.log"

# Ensure logs directory exists
mkdir -p "$SCRIPT_DIR/logs"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[Gateway]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[Gateway]${NC} $1"
}

error() {
    echo -e "${RED}[Gateway]${NC} $1"
}

# Check if Gateway is running
is_running() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            return 0
        fi
    fi
    return 1
}

# Check if wrapper is running
is_wrapper_running() {
    if [ -f "$WRAPPER_PID_FILE" ]; then
        local pid=$(cat "$WRAPPER_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            return 0
        fi
    fi
    return 1
}

# Start the Gateway server in a restart loop
start_gateway() {
    if is_wrapper_running; then
        error "Gateway wrapper is already running (PID: $(cat "$WRAPPER_PID_FILE"))"
        return 1
    fi

    if is_running; then
        error "Gateway is already running (PID: $(cat "$PID_FILE"))"
        return 1
    fi

    log "Starting Gateway..."

    # Check for required environment variables
    if [ -z "$GATEWAY_PASSPHRASE" ]; then
        error "GATEWAY_PASSPHRASE environment variable is required"
        error "Usage: GATEWAY_PASSPHRASE=yourpassphrase $0 start"
        return 1
    fi

    # Parse additional arguments
    local dev_mode=""
    shift # Remove 'start' from args
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dev)
                dev_mode="--dev"
                shift
                ;;
            *)
                shift
                ;;
        esac
    done

    # Start the wrapper process in the background
    (
        while true; do
            log "Starting Gateway server..."

            # Run Gateway
            cd "$SCRIPT_DIR"
            START_SERVER=true node dist/index.js $dev_mode
            exit_code=$?

            if [ $exit_code -eq 0 ]; then
                log "Gateway requested restart (exit code 0). Restarting in 2 seconds..."
                sleep 2
            else
                log "Gateway stopped (exit code $exit_code). Not restarting."
                rm -f "$WRAPPER_PID_FILE"
                break
            fi
        done
    ) >> "$LOG_FILE" 2>&1 &

    # Capture the background job PID immediately after &
    echo "$!" > "$WRAPPER_PID_FILE"

    # Wait a moment for startup
    sleep 3

    if is_running; then
        log "Gateway started successfully (PID: $(cat "$PID_FILE"))"
        log "Wrapper PID: $(cat "$WRAPPER_PID_FILE")"
        log "Logs: $LOG_FILE"
    else
        error "Gateway failed to start. Check logs: $LOG_FILE"
        return 1
    fi
}

# Stop the Gateway server
stop_gateway() {
    local stopped=0

    # First, stop the wrapper to prevent restart
    if is_wrapper_running; then
        local wrapper_pid=$(cat "$WRAPPER_PID_FILE")
        log "Stopping Gateway wrapper (PID: $wrapper_pid)..."
        kill "$wrapper_pid" 2>/dev/null
        rm -f "$WRAPPER_PID_FILE"
        stopped=1
    fi

    # Then stop the Gateway process
    if is_running; then
        local pid=$(cat "$PID_FILE")
        log "Stopping Gateway server (PID: $pid)..."
        kill "$pid" 2>/dev/null

        # Wait for process to stop
        local count=0
        while kill -0 "$pid" 2>/dev/null && [ $count -lt 10 ]; do
            sleep 1
            count=$((count + 1))
        done

        if kill -0 "$pid" 2>/dev/null; then
            warn "Gateway didn't stop gracefully, force killing..."
            kill -9 "$pid" 2>/dev/null
        fi

        rm -f "$PID_FILE"
        stopped=1
    fi

    if [ $stopped -eq 1 ]; then
        log "Gateway stopped"
    else
        warn "Gateway is not running"
    fi
}

# Restart the Gateway server (via API)
restart_gateway() {
    if ! is_running; then
        warn "Gateway is not running. Starting..."
        start_gateway "$@"
        return
    fi

    log "Requesting Gateway restart via API..."

    # Determine protocol based on dev mode
    local protocol="https"
    local curl_opts="-k"

    # Try to detect if running in dev mode by checking the process
    if ps aux | grep -v grep | grep "node dist/index.js" | grep -q "\-\-dev"; then
        protocol="http"
        curl_opts=""
    fi

    local port=$(grep -E "^port:" "$SCRIPT_DIR/conf/server.yml" 2>/dev/null | awk '{print $2}' || echo "15888")

    curl -s -X POST $curl_opts "$protocol://localhost:$port/restart" > /dev/null

    if [ $? -eq 0 ]; then
        log "Restart request sent. Gateway will restart automatically."
    else
        error "Failed to send restart request. Is Gateway running?"
    fi
}

# Show Gateway status
status_gateway() {
    echo ""
    if is_wrapper_running; then
        log "Wrapper: ${GREEN}running${NC} (PID: $(cat "$WRAPPER_PID_FILE"))"
    else
        log "Wrapper: ${RED}not running${NC}"
    fi

    if is_running; then
        local pid=$(cat "$PID_FILE")
        log "Gateway: ${GREEN}running${NC} (PID: $pid)"

        # Try to get status from API
        local port=$(grep -E "^port:" "$SCRIPT_DIR/conf/server.yml" 2>/dev/null | awk '{print $2}' || echo "15888")
        local response=$(curl -s -k "https://localhost:$port/" 2>/dev/null || curl -s "http://localhost:$port/" 2>/dev/null)

        if [ -n "$response" ]; then
            log "API: ${GREEN}responding${NC}"
        else
            warn "API: ${YELLOW}not responding${NC}"
        fi
    else
        log "Gateway: ${RED}not running${NC}"
    fi
    echo ""
}

# Show usage
usage() {
    echo ""
    echo "Gateway Lifecycle Manager"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  start [--dev]    Start Gateway server (--dev for HTTP mode)"
    echo "  stop             Stop Gateway server"
    echo "  restart          Restart Gateway server"
    echo "  status           Show Gateway status"
    echo ""
    echo "Environment variables:"
    echo "  GATEWAY_PASSPHRASE    Required passphrase for wallet encryption"
    echo ""
    echo "Examples:"
    echo "  GATEWAY_PASSPHRASE=mypassword $0 start"
    echo "  GATEWAY_PASSPHRASE=mypassword $0 start --dev"
    echo "  $0 stop"
    echo "  $0 status"
    echo ""
}

# Main
case "${1:-}" in
    start)
        start_gateway "$@"
        ;;
    stop)
        stop_gateway
        ;;
    restart)
        restart_gateway "$@"
        ;;
    status)
        status_gateway
        ;;
    *)
        usage
        exit 1
        ;;
esac
