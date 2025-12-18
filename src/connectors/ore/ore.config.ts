import { PublicKey } from '@solana/web3.js';

import { AvailableNetworks } from '../../services/base';

export namespace OreConfig {
  // Program IDs
  export const ORE_PROGRAM_ID = new PublicKey('oreV3EG1i9BEgiAJ8b177Z2S2rMarzak4NMv1kULvWv');
  export const ORE_TOKEN_MINT = new PublicKey('oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp');
  export const ENTROPY_PROGRAM_ID = new PublicKey('3jSkUuYBoJzQPMEzTvkDFXCZUBksPamrVhrnHR9igu2X');

  // Token program IDs
  export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
  export const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');

  // Instruction discriminators (single u8 values for Steel framework)
  export const DISCRIMINATORS = {
    automate: 0,
    checkpoint: 2,
    claimSol: 3,
    claimOre: 4,
    close: 5,
    deploy: 6,
    log: 8,
    reset: 9,
    deposit: 10,
    withdraw: 11,
    claimYield: 12,
    bury: 13,
    wrap: 14,
    setAdmin: 15,
    setFeeCollector: 16,
    newVar: 17,
    setBuffer: 18,
  } as const;

  // Account discriminators (first 8 bytes)
  export const ACCOUNT_DISCRIMINATORS = {
    Automation: [100, 0, 0, 0, 0, 0, 0, 0],
    Config: [101, 0, 0, 0, 0, 0, 0, 0],
    Miner: [103, 0, 0, 0, 0, 0, 0, 0],
    Treasury: [104, 0, 0, 0, 0, 0, 0, 0],
    Board: [105, 0, 0, 0, 0, 0, 0, 0],
    Stake: [108, 0, 0, 0, 0, 0, 0, 0],
    Round: [109, 0, 0, 0, 0, 0, 0, 0],
  } as const;

  // PDA seeds
  export const PDA_SEEDS = {
    automation: 'automation',
    board: 'board',
    config: 'config',
    miner: 'miner',
    round: 'round',
    stake: 'stake',
    treasury: 'treasury',
  } as const;

  // Supported networks (ORE v3 is only on mainnet-beta)
  export const chain = 'solana';
  export const networks = ['mainnet-beta'] as const;
  export type Network = (typeof networks)[number];

  // Trading types (ore is a new trading type for mining game)
  export const tradingTypes = ['ore'] as const;

  export interface RootConfig {
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: RootConfig = {
    availableNetworks: [
      {
        chain,
        networks: [...networks],
      },
    ],
  };

  // Helper to derive PDAs
  export function getBoardPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from(PDA_SEEDS.board)], ORE_PROGRAM_ID);
  }

  export function getConfigPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from(PDA_SEEDS.config)], ORE_PROGRAM_ID);
  }

  export function getTreasuryPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from(PDA_SEEDS.treasury)], ORE_PROGRAM_ID);
  }

  export function getMinerPDA(authority: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from(PDA_SEEDS.miner), authority.toBuffer()], ORE_PROGRAM_ID);
  }

  export function getStakePDA(authority: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from(PDA_SEEDS.stake), authority.toBuffer()], ORE_PROGRAM_ID);
  }

  export function getAutomationPDA(authority: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from(PDA_SEEDS.automation), authority.toBuffer()], ORE_PROGRAM_ID);
  }

  export function getRoundPDA(roundId: bigint): [PublicKey, number] {
    const roundIdBuffer = Buffer.alloc(8);
    roundIdBuffer.writeBigUInt64LE(roundId);
    return PublicKey.findProgramAddressSync([Buffer.from(PDA_SEEDS.round), roundIdBuffer], ORE_PROGRAM_ID);
  }
}
