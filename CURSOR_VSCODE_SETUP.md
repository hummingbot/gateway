# VS Code Setup Guide

This guide provides the minimal VS Code configuration needed to work with the Gateway project's dual test suite setup (main tests + RecordAndPlay) and debug the server.

## Jest extension for test discovery and debugging

- **Jest** (`orta.vscode-jest`)

### Settings (`.vscode/settings.json`)

Configure Jest virtual folders for multiple test suites

```json
{
  "jest.virtualFolders": [
    {
      "name": "test-play",
      "jestCommandLine": "pnpm test-play",
      "runMode": "watch"
    },
    {
      "name": "test-record", 
      "jestCommandLine": "pnpm test-record",
      "runMode": "on-demand"
    }
  ]
}
```

## Debugging the server and test-play

### launch.json (`.vscode/launch.json`)

Launch configuration for debugging the Gateway server and unit tests.

```json
{
  "configurations": [
    {
      "name": "Debug Gateway Server",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": [
        "start"
      ],
      "env": {
        "GATEWAY_PASSPHRASE": "${input:password}",
      },
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "skipFiles": [
        "<node_internals>/**",
        "${workspaceFolder}/node_modules/**"
      ],
      "preLaunchTask": "build"
    },
    {
      "name": "vscode-jest-tests.v2.test-play",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/jest/bin/jest.js",
      "cwd": "${workspaceFolder}",
      "env": {
        "GATEWAY_TEST_MODE": "test"
      },
      "args": [
        // Make sure to keep aligned with package.json config
        "--verbose",
        "--testNamePattern",
        "${jest.testNamePattern}",
        "--runTestsByPath",
        "${jest.testFile}"
      ],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "skipFiles": [
        "<node_internals>/**",
        "${workspaceFolder}/node_modules/**"
      ],
    },
    {
      "name": "vscode-jest-tests.v2.test-record",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/jest/bin/jest.js",
      "cwd": "${workspaceFolder}",
      "env": {
        "GATEWAY_TEST_MODE": "test"
      },
      "args": [
        "--config",
        "${workspaceFolder}/test-record/jest.config.js",
        "--testNamePattern",
        "${jest.testNamePattern}",
        "--runTestsByPath",
        "${jest.testFile}",
        "--runInBand",
        "-u"
      ],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
    }
  ],
  "inputs": [
    {
      "id": "password",
      "type": "promptString",
      "description": "Specify a password to use for gateway passphrase.",
    },
  ]
}
```

### Tasks (`.vscode/tasks.json`)

Build task for pre-launch compilation

```json
{
  "tasks": [
    {
      "type": "npm",
      "script": "build",
      "group": "build",
      "label": "build"
    }
  ]
}
```
