#!/bin/bash

# Start Mobile Gateway with Ngrok Tunnel
# This script starts the gateway server and ngrok tunnel for mobile access

set -e

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Mobile Gateway with Ngrok...${NC}"

# Check if .env.mobile exists
if [ ! -f .env.mobile ]; then
  echo -e "${RED}Error: .env.mobile not found!${NC}"
  echo "Please create .env.mobile with your configuration:"
  echo "  - GATEWAY_PASSPHRASE"
  echo "  - NGROK_AUTHTOKEN (from https://dashboard.ngrok.com)"
  echo "  - GATEWAY_API_KEYS (optional)"
  exit 1
fi

# Start services
echo -e "${YELLOW}Starting Docker containers...${NC}"
docker-compose -f docker-compose.mobile.yml --env-file .env.mobile up -d

# Wait for services to be ready
echo -e "${YELLOW}Waiting for services to start...${NC}"
sleep 5

# Check if gateway is healthy
if ! curl -s http://localhost:15888 > /dev/null 2>&1; then
  echo -e "${RED}Warning: Gateway may not be fully started yet${NC}"
fi

# Get ngrok URL
echo ""
echo -e "${GREEN}Ngrok Tunnel Information:${NC}"
echo "Web Interface: http://localhost:4040"
echo ""

# Try to get the public URL
if command -v jq &> /dev/null; then
  NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | jq -r '.tunnels[0].public_url' 2>/dev/null)
else
  NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o 'https://[^"]*ngrok[^"]*' | head -1)
fi

if [ -n "$NGROK_URL" ]; then
  echo -e "${GREEN}Public Gateway URL:${NC} $NGROK_URL"
  echo ""
  echo -e "${YELLOW}Use this URL when building the Android app!${NC}"
else
  echo -e "${YELLOW}Ngrok URL not ready yet. Check http://localhost:4040 in a few seconds.${NC}"
fi

echo ""
echo -e "${GREEN}Gateway is running!${NC}"
echo ""
echo "Next steps:"
echo "  1. Copy the ngrok URL above"
echo "  2. Run: cd gateway-app && ./build-android.sh"
echo "  3. Install APK on your Android device"
echo ""
echo "To stop: docker-compose -f docker-compose.mobile.yml down"
