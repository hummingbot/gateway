#!/bin/bash

# Build Gateway Android APK (Debug) with Ngrok URL
# This script builds a debug APK for testing (faster build, includes debug symbols)

set -e

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Building Gateway Android APK (Debug)...${NC}"
echo ""

# Check if gateway is running
if ! curl -s http://localhost:15888 > /dev/null 2>&1; then
  echo -e "${RED}Error: Gateway is not running!${NC}"
  echo "Please start the gateway first:"
  echo "  cd .. && ./scripts/start-mobile-gateway.sh"
  exit 1
fi

# Get ngrok URL
echo -e "${YELLOW}Detecting ngrok URL...${NC}"
if command -v jq &> /dev/null; then
  NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | jq -r '.tunnels[0].public_url' 2>/dev/null)
else
  NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o 'https://[^"]*ngrok[^"]*' | head -1)
fi

if [ -z "$NGROK_URL" ]; then
  echo -e "${RED}Error: Could not detect ngrok URL!${NC}"
  echo "Please check:"
  echo "  1. Gateway is running with ngrok"
  echo "  2. Ngrok web interface is accessible at http://localhost:4040"
  exit 1
fi

echo -e "${GREEN}Gateway URL:${NC} $NGROK_URL"
echo ""

# Export environment variable for Vite build
export VITE_GATEWAY_URL=$NGROK_URL

# Check if Android environment is set up
if [ -z "$ANDROID_HOME" ]; then
  echo -e "${RED}Error: ANDROID_HOME not set!${NC}"
  echo "Please set up Android development environment:"
  echo "  export ANDROID_HOME=\$HOME/Library/Android/sdk"
  echo "  export JAVA_HOME=/Applications/Android\\ Studio.app/Contents/jbr/Contents/Home"
  exit 1
fi

# Check if Tauri Android is initialized
if [ ! -d "src-tauri/gen/android" ]; then
  echo -e "${YELLOW}Initializing Tauri Android project...${NC}"
  pnpm tauri android init
fi

# Build debug APK (faster, includes debug symbols)
echo -e "${YELLOW}Building debug APK (faster than release build)...${NC}"
pnpm tauri android build --debug

echo ""
echo -e "${GREEN}✅ Debug APK built successfully!${NC}"
echo ""
echo -e "${YELLOW}APK Location:${NC}"
APK_PATH="src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk"
if [ -f "$APK_PATH" ]; then
  echo "  $APK_PATH"
  echo ""
  echo -e "${YELLOW}Install on device:${NC}"
  echo "  adb install $APK_PATH"
  echo ""
  echo -e "${YELLOW}Or install via USB:${NC}"
  echo "  1. Connect Android device via USB"
  echo "  2. Enable USB debugging on device"
  echo "  3. Run: adb devices (verify device is connected)"
  echo "  4. Run: adb install $APK_PATH"
else
  echo -e "${RED}Warning: APK not found at expected location${NC}"
  echo "Check: src-tauri/gen/android/app/build/outputs/apk/"
fi

echo ""
echo -e "${GREEN}Gateway URL in APK:${NC} $NGROK_URL"
echo -e "${YELLOW}Note: This is a DEBUG build. Use build-android.sh for production builds.${NC}"
