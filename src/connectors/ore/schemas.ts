import { Static, Type } from '@sinclair/typebox';

import { getSolanaChainConfig } from '../../chains/solana/solana.config';

import { OreConfig } from './ore.config';

// Get chain config for defaults
const solanaChainConfig = getSolanaChainConfig();

// ============================================================================
// Response Schemas
// ============================================================================

// Square info for each square on the 5x5 board
const SquareInfo = Type.Object({
  deployed: Type.Number({ description: 'SOL deployed to this square' }),
  miners: Type.Number({ description: 'Number of miners who deployed to this square' }),
});

// Board Info Response (includes current round info)
export const OreBoardInfoResponse = Type.Object({
  roundId: Type.Number({ description: 'Round number' }),
  roundAddress: Type.String({ description: 'Round PDA address' }),
  secondsLeft: Type.Number({ description: 'Seconds remaining in current round (0 for historical rounds)' }),
  winningSquare: Type.Union([Type.Number(), Type.Null()], {
    description: 'Winning square (1-25), null if round not finalized',
  }),
  winnerMiners: Type.Number({ description: 'Number of miners who won (deployed to winning square)' }),
  oreWinnerSplit: Type.Boolean({ description: 'True if ORE reward was split among all winners' }),
  oreWinner: Type.Union([Type.String(), Type.Null()], {
    description: 'ORE winner address (single winner), null if split or no winner',
  }),
  oreReward: Type.Number({ description: 'ORE reward amount' }),
  squares: Type.Record(Type.String(), SquareInfo, {
    description: 'Square data indexed 1-25 (5x5 grid)',
  }),
  totalDeployedSol: Type.Number({ description: 'Total SOL deployed this round' }),
  totalVaultedSol: Type.Number({ description: 'Total SOL vaulted this round' }),
  totalWinningsSol: Type.Number({ description: 'Total SOL winnings this round' }),
  motherlodeOre: Type.Number({ description: 'Prize pool in ORE' }),
  totalMiners: Type.Number({ description: 'Total number of unique miners' }),
  expiresAt: Type.Number({ description: 'Round expiration timestamp (unix seconds)' }),
});

export type OreBoardInfoResponseType = Static<typeof OreBoardInfoResponse>;

// Account Info Response (miner + stake combined)
export const OreAccountInfoResponse = Type.Object({
  // Account addresses
  mineAddress: Type.Union([Type.String(), Type.Null()], { description: 'Mine PDA address (null if not created)' }),
  stakeAddress: Type.Union([Type.String(), Type.Null()], { description: 'Stake PDA address (null if not created)' }),
  // Mine info
  lastRound: Type.Union([Type.Number(), Type.Null()], {
    description: 'Last round the miner deployed to (null if never mined)',
  }),
  checkedRound: Type.Union([Type.Number(), Type.Null()], {
    description: 'Last round the miner checkpointed (null if never checkpointed)',
  }),
  currentRound: Type.Object({
    roundId: Type.Union([Type.Number(), Type.Null()], { description: 'Current round ID' }),
    deployedSol: Type.Record(Type.String(), Type.Number(), {
      description: 'SOL deployed per square this round (1-25)',
    }),
  }),
  rewardsSol: Type.Number({ description: 'Claimable SOL rewards' }),
  rewardsOre: Type.Number({ description: 'Claimable ORE rewards' }),
  lifetimeRewardsSol: Type.Number({ description: 'Lifetime SOL rewards' }),
  lifetimeRewardsOre: Type.Number({ description: 'Lifetime ORE rewards' }),
  lifetimeDeployed: Type.Number({ description: 'Lifetime SOL deployed' }),
  // Stake info
  stakedOre: Type.Number({ description: 'Staked ORE balance' }),
  stakeRewardsOre: Type.Number({ description: 'Claimable staking rewards' }),
  lifetimeStakeRewardsOre: Type.Number({ description: 'Lifetime staking rewards' }),
});

export type OreAccountInfoResponseType = Static<typeof OreAccountInfoResponse>;

// System Info Response (treasury + config combined)
export const OreSystemInfoResponse = Type.Object({
  treasuryAddress: Type.String({ description: 'Treasury PDA address' }),
  treasuryBalanceSol: Type.Number({ description: 'Treasury balance in SOL' }),
  maxSupplyOre: Type.Number({ description: 'Maximum ORE supply (5 million)' }),
  circulatingSupplyOre: Type.Number({ description: 'Circulating ORE supply (from token mint)' }),
  buriedOre: Type.Number({ description: 'Buried (burned) ORE' }),
  totalRefinedOre: Type.Number({ description: 'Total refined ORE' }),
  totalStakedOre: Type.Number({ description: 'Total staked ORE' }),
  totalUnclaimedOre: Type.Number({ description: 'Total unclaimed ORE rewards' }),
  motherlodeOre: Type.Number({ description: 'Motherlode prize pool in ORE' }),
});

export type OreSystemInfoResponseType = Static<typeof OreSystemInfoResponse>;

// Transaction Response
export const OreTransactionResponse = Type.Object({
  signature: Type.String({ description: 'Transaction signature' }),
  message: Type.Optional(Type.String({ description: 'Additional message' })),
});

export type OreTransactionResponseType = Static<typeof OreTransactionResponse>;

// Checkpoint Response (with details about the round)
export const OreCheckpointResponse = Type.Object({
  signature: Type.String({ description: 'Transaction signature' }),
  roundId: Type.Number({ description: 'Round that was checkpointed' }),
  winningSquare: Type.Number({ description: 'Winning square (1-25)' }),
  deployedSquares: Type.Array(Type.Number(), { description: 'Squares you deployed to (1-25)' }),
  deployedSol: Type.Number({ description: 'Total SOL you deployed' }),
  won: Type.Boolean({ description: 'Whether you deployed to the winning square' }),
  wonSol: Type.Number({ description: 'SOL winnings from this round' }),
  wonOre: Type.Number({ description: 'ORE winnings from this round' }),
});

export type OreCheckpointResponseType = Static<typeof OreCheckpointResponse>;

// ============================================================================
// Request Schemas - GET Routes
// ============================================================================

// Board Info Request
export const OreBoardInfoRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...OreConfig.networks],
    }),
  ),
  roundId: Type.Optional(
    Type.Number({
      description: 'Optional round ID to fetch historical round info (defaults to current round)',
    }),
  ),
});

export type OreBoardInfoRequestType = Static<typeof OreBoardInfoRequest>;

// Account Info Request
export const OreAccountInfoRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...OreConfig.networks],
    }),
  ),
  walletAddress: Type.String({
    description: 'Wallet address to query account info for',
    examples: [solanaChainConfig.defaultWallet],
  }),
  roundId: Type.Optional(
    Type.Number({
      description: 'Optional round ID to fetch historical round info (defaults to current round)',
    }),
  ),
});

export type OreAccountInfoRequestType = Static<typeof OreAccountInfoRequest>;

// System Info Request
export const OreSystemInfoRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...OreConfig.networks],
    }),
  ),
});

export type OreSystemInfoRequestType = Static<typeof OreSystemInfoRequest>;

// ============================================================================
// Request Schemas - POST Mining Routes
// ============================================================================

// Deploy Request
export const OreDeployRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...OreConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Wallet address',
      default: solanaChainConfig.defaultWallet,
    }),
  ),
  amount: Type.Number({
    description: 'Amount of SOL to deploy (in SOL, not lamports)',
    minimum: 0,
    examples: [0.1],
  }),
  squares: Type.Array(Type.Number(), {
    description: 'Square(s) to deploy to (1-25). SOL is split evenly across selected squares.',
    examples: [[13], [1, 6, 11, 16, 21]],
  }),
});

export type OreDeployRequestType = Static<typeof OreDeployRequest>;

// Checkpoint Request
export const OreCheckpointRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...OreConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Wallet address',
      default: solanaChainConfig.defaultWallet,
    }),
  ),
  roundId: Type.Optional(
    Type.String({
      description: 'Round ID to checkpoint (defaults to last completed round)',
    }),
  ),
});

export type OreCheckpointRequestType = Static<typeof OreCheckpointRequest>;

// Claim SOL Request
export const OreClaimSolRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...OreConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Wallet address',
      default: solanaChainConfig.defaultWallet,
    }),
  ),
});

export type OreClaimSolRequestType = Static<typeof OreClaimSolRequest>;

// Claim ORE Request
export const OreClaimOreRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...OreConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Wallet address',
      default: solanaChainConfig.defaultWallet,
    }),
  ),
});

export type OreClaimOreRequestType = Static<typeof OreClaimOreRequest>;

// ============================================================================
// Request Schemas - POST Staking Routes
// ============================================================================

// Stake Request
export const OreStakeRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...OreConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Wallet address',
      default: solanaChainConfig.defaultWallet,
    }),
  ),
  amount: Type.Number({
    description: 'Amount of ORE to stake',
    minimum: 0,
    examples: [100],
  }),
});

export type OreStakeRequestType = Static<typeof OreStakeRequest>;

// Unstake Request
export const OreUnstakeRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...OreConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Wallet address',
      default: solanaChainConfig.defaultWallet,
    }),
  ),
  amount: Type.Number({
    description: 'Amount of ORE to unstake',
    minimum: 0,
    examples: [100],
  }),
});

export type OreUnstakeRequestType = Static<typeof OreUnstakeRequest>;

// Claim Stake Rewards Request
export const OreClaimStakeRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...OreConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Wallet address',
      default: solanaChainConfig.defaultWallet,
    }),
  ),
  amount: Type.Optional(
    Type.Number({
      description: 'Amount of yield to claim (defaults to all available)',
      minimum: 0,
    }),
  ),
});

export type OreClaimStakeRequestType = Static<typeof OreClaimStakeRequest>;
