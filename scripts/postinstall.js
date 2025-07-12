#!/usr/bin/env node

const { execSync } = require('child_process');
const os = require('os');

console.log('🔧 Gateway Post-Install Script');
console.log('==============================');

// Check if native dependencies need to be rebuilt
try {
  // Try to load the USB HID module
  require('@ledgerhq/hw-transport-node-hid');
  console.log('✅ Hardware wallet dependencies loaded successfully');
} catch (error) {
  console.log('⚠️  Hardware wallet dependencies need to be built');
  console.log('   This is required for Ledger hardware wallet support');
  
  // Provide platform-specific instructions
  const platform = os.platform();
  
  console.log('\n📋 Platform-specific requirements:');
  
  if (platform === 'darwin') {
    console.log('\n   macOS detected:');
    console.log('   - Ensure Xcode Command Line Tools are installed: xcode-select --install');
    console.log('   - Install libusb: brew install libusb');
  } else if (platform === 'linux') {
    console.log('\n   Linux detected:');
    console.log('   - Install build tools: sudo apt install build-essential');
    console.log('   - Install USB libraries: sudo apt install libusb-1.0-0-dev libudev-dev');
    console.log('   - Add udev rules: wget -q -O - https://raw.githubusercontent.com/LedgerHQ/udev-rules/master/add_udev_rules.sh | sudo bash');
  }
  
  console.log('\n   After installing prerequisites, run: pnpm install --force');
  console.log('\n   Note: Gateway will still work without hardware wallet support');
}

// Check for other common issues
try {
  require('bigint-buffer');
} catch (error) {
  console.log('\n⚠️  Optional: bigint-buffer native bindings not loaded');
  console.log('   This is not critical - pure JS implementation will be used');
  console.log('   To build native bindings (optional): pnpm rebuild-bigint');
}

console.log('\n✨ Post-install check complete!');