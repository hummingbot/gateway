import { ApiPromise, WsProvider, Keyring } from '@polkadot/api';
import { PoolService, PoolType } from '@galacticcouncil/sdk';

async function main() {
  // 1. Connect to Basilisk node
  const api = await ApiPromise.create({ provider: new WsProvider('wss://rpc.basilisk.cloud') });
  
  // 2. Initialize SDK PoolService and sync pool registry
  const poolService = new PoolService(api);
  await poolService.syncRegistry(); // ensures we have up-to-date pool info
  
  // 3. Choose an XYK pool – for example, the first available XYK pool in the registry
  const [xykPool] = await poolService.getPools([PoolType.XYK]);
  if (!xykPool) {
    throw new Error('No XYK pools found on Basilisk.');
  }
  console.log(`Selected XYK Pool: Assets = ${xykPool.tokens.map(t => t.symbol).join('/')}, Pool ID = ${xykPool.id}`);
  
  // 4. Load user account from mnemonic
  const keyring = new Keyring({ type: 'sr25519' });
  const account = keyring.addFromUri('<YOUR MNEMONIC>');
  console.log(`Using account: ${account.address}`);
  
  // 5. Retrieve the user’s position in the selected XYK pool.
  // For XYK, this means checking the user's balance of the pool’s LP token (share asset).
  const lpAssetId = xykPool.id!;  // PoolBase.id is the asset ID of the LP token
  const { free: lpBalance } = await api.query.tokens.accounts(account.address, lpAssetId);
  console.log(`User LP Token Balance in pool ${xykPool.id}:`, lpBalance.toString());
  
  // (Optional) Compute underlying asset amounts from LP token balance:
  // total pool balances and total LP supply
  const totalSupply = await api.query.tokens.totalIssuance(lpAssetId);
  const [assetA, assetB] = xykPool.tokens;
  const userShareFraction = lpBalance.toBn().isZero() 
    ? 0 
    : lpBalance.toBn().toNumber() / totalSupply.toBn().toNumber();
  const amountA = Math.floor(userShareFraction * Number(assetA.balance));
  const amountB = Math.floor(userShareFraction * Number(assetB.balance));
  console.log(`~ Underlying amounts: ${amountA} of ${assetA.symbol}, ${amountB} of ${assetB.symbol}`);
  
  // 6. Construct and send a remove-liquidity extrinsic for the XYK pool.
  // Basilisk’s XYK pallet expects the two asset IDs and the amount of LP tokens to burn.
  const assetIdA = assetA.id;
  const assetIdB = assetB.id;
  const removeAmount = lpBalance;  // remove all liquidity (burn all LP tokens)
  
  const tx = api.tx.xyk.removeLiquidity(assetIdA, assetIdB, removeAmount);
  console.log('Submitting removeLiquidity tx...');
  await tx.signAndSend(account, ({ status, events, dispatchError }) => {
    if (dispatchError) {
      console.error('Transaction failed:', dispatchError.toString());
    } else if (status.isInBlock) {
      console.log('Remove liquidity tx included in block!');
      events.forEach(({ event }) => {
        if (event.method === 'LiquidityRemoved') {
          console.log('LiquidityRemoved event:', event.toHuman());
        }
      });
    } else if (status.isFinalized) {
      console.log('Transaction finalized.');
      process.exit(0);
    }
  });
}

main().catch(console.error);
