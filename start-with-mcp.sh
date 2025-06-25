#!/bin/bash

# Start Gateway and MCP servers together

echo "Starting Gateway and MCP servers..."

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "Shutting down servers..."
    kill $GATEWAY_PID $MCP_PID 2>/dev/null
    exit
}

# Set up trap for cleanup
trap cleanup INT TERM EXIT

# Check if passphrase is provided
if [ -z "$1" ] && [ -z "$GATEWAY_PASSPHRASE" ]; then
    echo "Error: Gateway passphrase required"
    echo "Usage: ./start-with-mcp.sh --passphrase=XXX [additional gateway args]"
    echo "Or set GATEWAY_PASSPHRASE environment variable"
    exit 1
fi

# Start Gateway server in background
echo "Starting Gateway server..."
START_SERVER=true node dist/index.js "$@" &
GATEWAY_PID=$!

# Wait a bit for Gateway to start
sleep 3

# Check if Gateway started successfully
if ! kill -0 $GATEWAY_PID 2>/dev/null; then
    echo "Error: Gateway server failed to start"
    exit 1
fi

echo "Gateway server started (PID: $GATEWAY_PID)"

# Start MCP server in background
echo "Starting MCP server..."
node dist/mcp/index.js &
MCP_PID=$!

echo "MCP server started (PID: $MCP_PID)"
echo ""
echo "Both servers are running. Press Ctrl+C to stop."
echo ""
echo "Gateway API: http://localhost:15888"
echo "MCP server: Running on stdio (connect via MCP client)"
echo ""

# Wait for both processes
wait $GATEWAY_PID $MCP_PID