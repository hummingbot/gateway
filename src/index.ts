#!/usr/bin/env node

import { run } from '@oclif/core';

import { startGateway } from './app';

export const asciiLogo = `
╔██████╗  █████╗ ████████╗███████╗██╗    ██╗ █████╗ ██╗   ██╗
██╔════╝ ██╔══██╗╚══██╔══╝██╔════╝██║    ██║██╔══██╗╚██╗ ██╔╝
██║  ███╗███████║   ██║   █████╗  ██║ █╗ ██║███████║ ╚████╔╝ 
██║   ██║██╔══██║   ██║   ██╔══╝  ██║███╗██║██╔══██║  ╚██╔╝  
╚██████╔╝██║  ██║   ██║   ███████╗╚███╔███╔╝██║  ██║   ██║   
 ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝   ╚═╝   
`;

if (process.env.START_SERVER === 'true') {
  startGateway().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
} else if (process.env.GATEWAY_TEST_MODE !== 'test') {
  // Show logo for base command or help command
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === 'help') {
    console.log(asciiLogo);
  }

  run().then(require('@oclif/core/flush')).catch(require('@oclif/core/handle'));
}
