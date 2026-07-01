/**
 * swig:show — read-only: print the wallet's live on-chain policy. No signing, no owner key,
 * safe to run anytime. Run it after every policy change to verify the result.
 *
 * Swig actions aren't enumerable client-side, so program access is probed against the known
 * venue presets (plus GATEWAY_SWIG_PROGRAM_IDS) and spend caps against GATEWAY_SWIG_TOKEN_MINTS.
 *
 * Usage:
 *   GATEWAY_SWIG_ACCOUNT=<Swig PDA> \
 *   GATEWAY_SWIG_RPC_URL=<rpc url> \
 *   [GATEWAY_SWIG_TOKEN_MINTS=<mint,...>] \    # check spend caps for these mints
 *   [GATEWAY_SWIG_PROGRAM_IDS=<id,...>] \      # probe extra programs beyond the presets
 *     pnpm swig:show
 */

import { getConnectionFromEnv, printPolicy, requireSwigAccount } from './lib';

async function main(): Promise<void> {
  const { network, connection } = getConnectionFromEnv();
  const accountAddress = requireSwigAccount();
  const mints = (process.env.GATEWAY_SWIG_TOKEN_MINTS || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  const extraProgramIds = (process.env.GATEWAY_SWIG_PROGRAM_IDS || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  console.log(`Network: ${network}\n`);
  await printPolicy(connection, accountAddress, extraProgramIds, mints);
}

main().catch((error) => {
  console.error(`\nswig:show failed: ${error.message}`);
  process.exit(1);
});
