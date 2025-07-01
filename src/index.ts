#!/usr/bin/env node

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
  console.log(asciiLogo);
  console.log('Use "pnpm start" to start the Gateway server');
}
