#!/usr/bin/env node

import { run } from '@oclif/core';
import { startGateway } from './app';
import { setGlobalDispatcher, ProxyAgent } from 'undici';

export function setupProxy() {
  const proxy = process.env.HTTP_PROXY || process.env.http_proxy;
  if (proxy) {
    const dispatcher = new ProxyAgent(proxy);
    setGlobalDispatcher(dispatcher);
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    console.log(`[proxy] Enabled HTTP_PROXY=${proxy}`);
  }
}

setupProxy();

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
} else {
  // Show logo for base command or help command
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === 'help') {
    console.log(asciiLogo);
  }
  
  run()
    .then(require('@oclif/core/flush'))
    .catch(require('@oclif/core/handle'));
}
