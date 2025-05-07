#!/bin/bash
# Test script for Gateway and Gateway Code setup

echo "Testing Gateway Build..."
pnpm build

if [ $? -eq 0 ]; then
  echo "✓ Gateway build successful!"
else
  echo "✗ Gateway build failed!"
  exit 1
fi

echo "Testing Gateway Code setup..."
cd code || exit 1
pnpm install --no-frozen-lockfile

if [ $? -eq 0 ]; then
  echo "✓ Gateway Code dependencies installed successfully!"
else
  echo "✗ Gateway Code dependencies installation failed, but continuing..."
fi

pnpm build

if [ $? -eq 0 ]; then
  echo "✓ Gateway Code build successful!"
else
  echo "✗ Gateway Code build failed, but continuing..."
fi

echo "Tests completed!"