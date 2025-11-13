# Mobile Gateway Deployment Guide

This guide walks you through deploying the Gateway server with ngrok tunneling and building an Android app for mobile access.

## 📱 Architecture Overview

```
[Android App] → [Ngrok Tunnel] → [Docker Gateway:15888]
                                       ↓
                               [conf/, logs/ volumes]
```

The Android app connects to your gateway server via an ngrok tunnel, allowing you to:
- View portfolio balances
- Execute swaps on DEXs
- Manage liquidity positions
- Configure gateway settings

All from your Android device, anywhere with internet access.

---

## 🚀 Quick Start

### Prerequisites

1. **Docker** installed and running
2. **Ngrok account** (free tier works): https://dashboard.ngrok.com/signup
3. **Android development environment** (see detailed setup below)
4. **Node.js & pnpm** installed

### Step 1: Configure Environment

1. Get your ngrok auth token from https://dashboard.ngrok.com/get-started/your-authtoken

2. Edit `.env.mobile` and add your credentials:
```bash
GATEWAY_PASSPHRASE=your-strong-passphrase-here
NGROK_AUTHTOKEN=your-ngrok-token-here
GATEWAY_API_KEYS=your-api-key-here  # Optional, for extra security
```

### Step 2: Start Gateway with Ngrok

```bash
./scripts/start-mobile-gateway.sh
```

This will:
- Start the Gateway Docker container
- Start ngrok tunnel
- Display your public gateway URL (e.g., `https://abc123.ngrok.io`)

**Save this URL** - you'll need it for testing.

### Step 3: Build Android APK

```bash
cd gateway-app
./build-android.sh
```

This will:
- Auto-detect the ngrok URL
- Build the Android APK with the URL baked in
- Take 10-20 minutes on first build (downloads dependencies)

### Step 4: Install on Android

**Option A: Via USB**
```bash
# 1. Enable USB debugging on your Android device
# 2. Connect device to computer via USB
# 3. Install APK
adb install src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk
```

**Option B: Manual Installation**
1. Copy APK to your device (email, USB, etc.)
2. On Android, open the APK file
3. Allow installation from unknown sources if prompted
4. Install the app

### Step 5: Use the App

1. Open "Gateway" app on your Android device
2. The app will automatically connect to your gateway
3. Add a wallet or use existing wallets
4. Start trading!

---

## 🛠️ Detailed Android Environment Setup

### macOS Setup

1. **Install Android Studio**
   - Download from: https://developer.android.com/studio
   - Install with default settings
   - Open Android Studio → Tools → SDK Manager
   - Install Android SDK Platform 24 or higher
   - Install Android SDK Build-Tools
   - Install Android SDK Platform-Tools

2. **Set Environment Variables**

   Add to `~/.zshrc` (or `~/.bash_profile` if using bash):
   ```bash
   # Android SDK
   export ANDROID_HOME=$HOME/Library/Android/sdk
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   export PATH=$PATH:$ANDROID_HOME/tools
   export PATH=$PATH:$ANDROID_HOME/tools/bin

   # Java (from Android Studio)
   export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
   export PATH=$PATH:$JAVA_HOME/bin
   ```

   Then reload:
   ```bash
   source ~/.zshrc
   ```

3. **Verify Installation**
   ```bash
   # Check Android SDK
   echo $ANDROID_HOME
   # Should output: /Users/YOUR_USERNAME/Library/Android/sdk

   # Check Java
   java -version
   # Should output: openjdk version "17.x.x" or higher

   # Check adb
   adb version
   # Should output: Android Debug Bridge version...
   ```

4. **Install Rust Android Targets**
   ```bash
   rustup target add aarch64-linux-android
   rustup target add armv7-linux-androideabi
   rustup target add i686-linux-android
   rustup target add x86_64-linux-android
   ```

5. **Initialize Tauri Android**
   ```bash
   cd gateway-app
   pnpm tauri android init
   ```

   This generates the Android project in `src-tauri/gen/android/`.

### Linux Setup

1. **Install Android Command Line Tools**
   ```bash
   # Download from: https://developer.android.com/studio#command-tools
   cd ~
   wget https://dl.google.com/android/repository/commandlinetools-linux-latest.zip
   unzip commandlinetools-linux-latest.zip
   mkdir -p ~/Android/sdk/cmdline-tools
   mv cmdline-tools ~/Android/sdk/cmdline-tools/latest
   ```

2. **Install SDK Components**
   ```bash
   export ANDROID_HOME=$HOME/Android/sdk
   export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
   export PATH=$PATH:$ANDROID_HOME/platform-tools

   sdkmanager "platform-tools" "platforms;android-33" "build-tools;33.0.0"
   ```

3. **Install Java 17**
   ```bash
   sudo apt update
   sudo apt install openjdk-17-jdk
   export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
   ```

4. **Install Rust Targets** (same as macOS step 4)

5. **Initialize Tauri Android** (same as macOS step 5)

---

## 📝 Build Scripts Reference

### `build-android.sh` - Production Build
- Builds **release APK** (optimized, smaller size)
- Auto-detects ngrok URL
- Takes 10-20 minutes on first build
- Output: `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`

**Usage:**
```bash
cd gateway-app
./build-android.sh
```

### `build-android-dev.sh` - Debug Build
- Builds **debug APK** (faster build, includes debug symbols)
- Useful for testing
- Takes 5-10 minutes on first build
- Output: `src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`

**Usage:**
```bash
cd gateway-app
./build-android-dev.sh
```

### `scripts/start-mobile-gateway.sh` - Start Gateway
- Starts Docker containers (gateway + ngrok)
- Displays ngrok public URL
- Shows web interface URL (http://localhost:4040)

**Usage:**
```bash
./scripts/start-mobile-gateway.sh
```

**Stop Gateway:**
```bash
docker-compose -f docker-compose.mobile.yml down
```

---

## 🔧 Configuration Files

### `.env.mobile`
Environment variables for Docker deployment:
```bash
GATEWAY_PASSPHRASE=your-passphrase    # Encrypts wallet keys
NGROK_AUTHTOKEN=your-token            # From ngrok.com
GATEWAY_API_KEYS=key1,key2            # Optional API keys
```

### `docker-compose.mobile.yml`
Docker services configuration:
- **gateway**: Gateway server on port 15888
- **ngrok**: Tunnel service with web UI on port 4040

### `gateway-app/src-tauri/tauri.conf.json`
Tauri app configuration with Android settings:
- Minimum SDK version: 24 (Android 7.0+)
- Permissions: Internet, network state
- App identifier: `io.hummingbot.gateway`

---

## 🔍 Troubleshooting

### Build Issues

**Error: "ANDROID_HOME not set"**
```bash
# Verify environment variables
echo $ANDROID_HOME
echo $JAVA_HOME

# If not set, add to ~/.zshrc (see setup section above)
```

**Error: "Could not find Android NDK"**
```bash
# Install NDK via Android Studio
# Tools → SDK Manager → SDK Tools → NDK (Side by side)
```

**Error: "Rust target not found"**
```bash
# Install all Android targets
rustup target add aarch64-linux-android armv7-linux-androideabi
```

**Build takes forever or hangs**
- First build downloads ~5GB of dependencies
- Subsequent builds are much faster (5-10 mins)
- Ensure good internet connection

### Runtime Issues

**App can't connect to gateway**
- Verify gateway is running: `curl http://localhost:15888`
- Check ngrok URL is correct: http://localhost:4040
- Ensure ngrok tunnel is active
- Check Android device has internet access

**App crashes on startup**
- Check Android version is 7.0+ (SDK 24+)
- View logs: `adb logcat | grep -i gateway`
- Try debug build for more logs: `./build-android-dev.sh`

**"SSL handshake failed" or certificate errors**
- Gateway uses HTTP in dev mode (DEV=true in docker-compose)
- Ngrok provides valid HTTPS certificates
- Check ngrok URL starts with `https://`

### Ngrok Issues

**"Ngrok URL not found"**
```bash
# Check ngrok is running
docker ps | grep ngrok

# Check ngrok web interface
curl http://localhost:4040/api/tunnels

# Restart ngrok
docker-compose -f docker-compose.mobile.yml restart ngrok
```

**Ngrok URL changes on restart**
- Free tier gives random URLs
- Upgrade to paid plan ($8/month) for static domain
- Or rebuild APK each time ngrok restarts

---

## 🎯 Advanced Usage

### Static Ngrok Domain (Paid Feature)

If you have an ngrok paid plan:

1. Get your static domain from https://dashboard.ngrok.com/domains

2. Update `docker-compose.mobile.yml`:
```yaml
ngrok:
  command:
    - "http"
    - "--domain=your-domain.ngrok-free.app"  # Add this
    - "gateway:15888"
```

3. Build APK with static URL:
```bash
export VITE_GATEWAY_URL=https://your-domain.ngrok-free.app
cd gateway-app
pnpm tauri android build --apk
```

Now your APK will work permanently without rebuilding!

### Custom Gateway URL

To build APK with a custom URL (e.g., your own domain, VPN):

```bash
export VITE_GATEWAY_URL=https://your-custom-domain.com
cd gateway-app
pnpm tauri android build --apk
```

### Building for Specific Architectures

By default, builds universal APK (all architectures, larger size).

For specific architecture:
```bash
# ARM64 only (most modern devices)
pnpm tauri android build --target aarch64

# ARMv7 (older devices)
pnpm tauri android build --target armv7
```

### Viewing Android Logs

```bash
# Connect device via USB
adb logcat | grep -i gateway

# Or filter by app package
adb logcat | grep io.hummingbot.gateway
```

---

## 📊 Deployment Checklist

Before building for production:

- [ ] Strong `GATEWAY_PASSPHRASE` set (32+ characters)
- [ ] `GATEWAY_API_KEYS` configured for authentication
- [ ] Ngrok account verified and token added
- [ ] Android environment fully set up and verified
- [ ] Gateway tested locally first
- [ ] Wallets added and tested on desktop
- [ ] Build scripts have execute permissions
- [ ] At least 10GB free disk space (for Android SDK)
- [ ] Good internet connection (for downloads)

Building APK:

- [ ] Gateway running with ngrok
- [ ] Ngrok URL verified and accessible
- [ ] Environment variables exported
- [ ] Build completes without errors
- [ ] APK file exists at expected location
- [ ] APK installs on test device
- [ ] App connects to gateway successfully
- [ ] All features work (balances, swaps, etc.)

---

## 🔒 Security Considerations

This setup reuses your existing gateway security:

1. **Wallet Encryption**: Uses `GATEWAY_PASSPHRASE` from `.env.mobile`
2. **API Authentication**: Optional `GATEWAY_API_KEYS` for request validation
3. **HTTPS**: Ngrok provides valid SSL certificates
4. **Rate Limiting**: Gateway has 100 req/min limit built-in

**Additional Recommendations:**

- Use strong, unique passphrase (32+ chars, random)
- Don't share ngrok URLs publicly
- Consider IP whitelisting in ngrok dashboard (paid feature)
- Monitor gateway logs for suspicious activity
- Use different API keys for mobile vs desktop
- Keep gateway Docker image updated

---

## 📱 APK Distribution

### For Personal Use
- Transfer APK via USB, email, cloud storage
- Install directly on your devices
- No Google Play account needed

### For Team/Public Distribution
- Sign APK with release keystore
- Distribute via Google Play Store
- Or use alternative stores (F-Droid, APKPure)

**Creating Release Keystore:**
```bash
keytool -genkey -v -keystore release.keystore \
  -alias gateway-key -keyalg RSA -keysize 2048 -validity 10000
```

Then update `src-tauri/gen/android/app/build.gradle` with signing config.

---

## 🆘 Getting Help

**Check logs:**
```bash
# Gateway logs
docker logs gateway

# Ngrok logs
docker logs gateway-ngrok

# Android logs
adb logcat | grep -i gateway
```

**Common resources:**
- Tauri Android Docs: https://v2.tauri.app/develop/android/
- Ngrok Docs: https://ngrok.com/docs
- Gateway API Docs: http://localhost:15888/docs (when running)

**File Issues:**
- Gateway issues: https://github.com/hummingbot/gateway/issues
- Tauri issues: https://github.com/tauri-apps/tauri/issues

---

## 📋 Summary

You now have:

1. ✅ Docker setup with ngrok tunnel (`docker-compose.mobile.yml`)
2. ✅ Helper scripts for easy deployment
3. ✅ Tauri configured for Android builds
4. ✅ Build scripts for production and debug APKs
5. ✅ Complete documentation

**Next steps:**
1. Set up Android environment (if not done)
2. Start gateway with ngrok
3. Build your first APK
4. Install and test on Android device
5. Trade on the go!

Happy trading! 🚀
