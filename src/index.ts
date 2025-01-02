import { startGateway } from './app';
import { startLarpServer } from './larp-app';
// import { run } from '@oclif/core';

startGateway();
startLarpServer();

// export const asciiLogo = `
//  _      __    ___   ___  
// | |    / /\\  | |_) | |_) 
// |_|__ /_/--\\ |_| \\ |_| 

// larp is a CLI/API client for on-chain liquidity providers
// `;

// if (process.env.START_SERVER === 'true') {
//   console.log(asciiLogo);
//   startServer().catch((error) => {
//     console.error('Failed to start server:', error);
//     process.exit(1);
//   });
// } else {
//   run()
//     .then(require('@oclif/core/flush'))
//     .catch(require('@oclif/core/handle'));
// }
