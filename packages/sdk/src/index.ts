/**
 * Protocol SDK - Main Export
 *
 * This is the main entry point for the Protocol SDK.
 * Currently implements Raydium on Solana.
 *
 * Usage:
 * ```typescript
 * import { RaydiumConnector } from '@nfttools/protocol-sdk';
 *
 * const raydium = await RaydiumConnector.getInstance('mainnet-beta');
 * const tx = await raydium.operations.addLiquidity.build({
 *   poolAddress: '...',
 *   walletAddress: '...',
 *   baseTokenAmount: 100,
 *   quoteTokenAmount: 200,
 * });
 * ```
 */

// Export core types
export * from '../core/src/types/protocol';
export * from '../core/src/types/prediction-market';

// Export Solana connectors
export * from './solana/raydium';

// Future exports:
// export * from './solana/meteora';
// export * from './solana/orca';
// export * from './ethereum/uniswap';
// export * from './ethereum/polymarket';
