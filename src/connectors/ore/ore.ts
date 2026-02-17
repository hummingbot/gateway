import { Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

import { Solana } from '../../chains/solana/solana';
import { SolanaLedger } from '../../chains/solana/solana-ledger';
import { httpErrors } from '../../services/error-handler';
import { logger } from '../../services/logger';

import { OreConfig } from './ore.config';
import {
  parseBoardAccount,
  parseConfigAccount,
  parseMinerAccount,
  parseRoundAccount,
  parseStakeAccount,
  parseTreasuryAccount,
  BoardAccount,
  ConfigAccount,
  MinerAccount,
  RoundAccount,
  StakeAccount,
  TreasuryAccount,
  bytesToHex,
} from './ore.parser';
import { OreAccountInfoResponseType, OreBoardInfoResponseType, OreSystemInfoResponseType } from './schemas';

export class Ore {
  private static _instances: { [name: string]: Ore };
  public solana: Solana;
  public config: OreConfig.RootConfig;

  private constructor() {
    this.config = OreConfig.config;
    this.solana = null as any;
  }

  /** Gets singleton instance of Ore */
  public static async getInstance(network: string): Promise<Ore> {
    if (!Ore._instances) {
      Ore._instances = {};
    }

    if (!Ore._instances[network]) {
      const instance = new Ore();
      await instance.init(network);
      Ore._instances[network] = instance;
    }

    return Ore._instances[network];
  }

  /** Initializes Ore instance */
  private async init(network: string) {
    try {
      this.solana = await Solana.getInstance(network);
      logger.info('ORE connector initialized');
    } catch (error) {
      logger.error('ORE connector initialization failed:', error);
      throw error;
    }
  }

  // ============================================================================
  // Account Fetching Methods
  // ============================================================================

  /** Fetch Board account (singleton) */
  async getBoardAccount(): Promise<BoardAccount> {
    const [boardPDA] = OreConfig.getBoardPDA();
    const accountInfo = await this.solana.connection.getAccountInfo(boardPDA, 'confirmed');

    if (!accountInfo) {
      throw httpErrors.notFound('Board account not found');
    }

    return parseBoardAccount(accountInfo.data as Buffer);
  }

  /** Fetch Config account (singleton) */
  async getConfigAccount(): Promise<ConfigAccount> {
    const [configPDA] = OreConfig.getConfigPDA();
    const accountInfo = await this.solana.connection.getAccountInfo(configPDA, 'confirmed');

    if (!accountInfo) {
      throw httpErrors.notFound('Config account not found');
    }

    return parseConfigAccount(accountInfo.data as Buffer);
  }

  /** Fetch Treasury account (singleton) */
  async getTreasuryAccount(): Promise<TreasuryAccount> {
    const [treasuryPDA] = OreConfig.getTreasuryPDA();
    const accountInfo = await this.solana.connection.getAccountInfo(treasuryPDA, 'confirmed');

    if (!accountInfo) {
      throw httpErrors.notFound('Treasury account not found');
    }

    return parseTreasuryAccount(accountInfo.data as Buffer);
  }

  /** Fetch Round account by ID */
  async getRoundAccount(roundId: bigint): Promise<RoundAccount> {
    const [roundPDA] = OreConfig.getRoundPDA(roundId);
    const accountInfo = await this.solana.connection.getAccountInfo(roundPDA, 'confirmed');

    if (!accountInfo) {
      throw httpErrors.notFound(`Round account not found for round ${roundId}`);
    }

    return parseRoundAccount(accountInfo.data as Buffer);
  }

  /** Fetch Miner account for a wallet */
  async getMinerAccount(walletAddress: string): Promise<MinerAccount | null> {
    let walletPubkey: PublicKey;
    try {
      walletPubkey = new PublicKey(walletAddress);
    } catch {
      throw httpErrors.badRequest(`Invalid wallet address: ${walletAddress}`);
    }

    const [minerPDA] = OreConfig.getMinerPDA(walletPubkey);
    const accountInfo = await this.solana.connection.getAccountInfo(minerPDA, 'confirmed');

    if (!accountInfo) {
      return null; // Miner account doesn't exist yet
    }

    return parseMinerAccount(accountInfo.data as Buffer);
  }

  /** Fetch Stake account for a wallet */
  async getStakeAccount(walletAddress: string): Promise<StakeAccount | null> {
    let walletPubkey: PublicKey;
    try {
      walletPubkey = new PublicKey(walletAddress);
    } catch {
      throw httpErrors.badRequest(`Invalid wallet address: ${walletAddress}`);
    }

    const [stakePDA] = OreConfig.getStakePDA(walletPubkey);
    const accountInfo = await this.solana.connection.getAccountInfo(stakePDA, 'confirmed');

    if (!accountInfo) {
      return null; // Stake account doesn't exist yet
    }

    return parseStakeAccount(accountInfo.data as Buffer);
  }

  // ============================================================================
  // High-Level Info Methods (for routes)
  // ============================================================================

  /** Get board info including round state */
  async getBoardInfo(roundId?: number): Promise<OreBoardInfoResponseType> {
    const board = await this.getBoardAccount();
    const requestedRoundId = roundId !== undefined ? BigInt(roundId) : board.roundId;
    const round = await this.getRoundAccount(requestedRoundId);

    const [roundPDA] = OreConfig.getRoundPDA(requestedRoundId);

    // Calculate seconds left in round (only relevant for current round)
    const currentSlot = await this.solana.connection.getSlot('confirmed');
    const slotsRemaining = Number(board.endSlot) - currentSlot;
    // Solana averages ~400ms per slot
    // For historical rounds, secondsLeft will be 0
    const isCurrentRound = requestedRoundId === board.roundId;
    const secondsLeft = isCurrentRound ? Math.max(0, Math.floor(slotsRemaining * 0.4)) : 0;

    // Calculate winning square from slotHash
    // slotHash is all zeros for current/unfinalized rounds
    // RNG: XOR four 8-byte chunks of the 32-byte hash, then mod 25
    const isFinalized = !round.slotHash.every((b) => b === 0);
    let winningSquare: number | null = null;
    let winningSquareIndex: number | null = null; // 0-indexed for internal use
    if (isFinalized) {
      const view = new DataView(round.slotHash.buffer, round.slotHash.byteOffset, 32);
      const r1 = view.getBigUint64(0, true);
      const r2 = view.getBigUint64(8, true);
      const r3 = view.getBigUint64(16, true);
      const r4 = view.getBigUint64(24, true);
      const rng = r1 ^ r2 ^ r3 ^ r4;
      winningSquareIndex = Number(rng % 25n); // 0-indexed internally
      winningSquare = winningSquareIndex + 1; // 1-indexed for API response
    }

    // Build squares dictionary (1-25) with SOL amounts
    const squares: Record<string, { deployed: number; miners: number }> = {};
    for (let i = 0; i < 25; i++) {
      squares[(i + 1).toString()] = {
        deployed: Number(round.deployed[i]) / 1_000_000_000, // Convert lamports to SOL
        miners: Number(round.count[i]),
      };
    }

    // Get winner miners count (miners who deployed to winning square)
    const winnerMiners = winningSquareIndex !== null ? Number(round.count[winningSquareIndex]) : 0;

    // Check for ORE winner
    // topMiner is system program if no winner, "SpLiT1111..." if split among winners
    const SYSTEM_PROGRAM = '11111111111111111111111111111111';
    const SPLIT_ADDRESS_PREFIX = 'SpLiT';
    const topMinerAddress = round.topMiner.toBase58();
    const isNoWinner = topMinerAddress === SYSTEM_PROGRAM;
    const isSplit = topMinerAddress.startsWith(SPLIT_ADDRESS_PREFIX);

    const ORE_DECIMALS = 11;

    return {
      roundId: Number(requestedRoundId),
      roundAddress: roundPDA.toBase58(),
      secondsLeft,
      winningSquare,
      winnerMiners,
      oreWinnerSplit: isSplit,
      oreWinner: !isNoWinner && !isSplit ? topMinerAddress : null,
      oreReward: Number(round.topMinerReward) / 10 ** ORE_DECIMALS,
      squares,
      totalDeployedSol: Number(round.totalDeployed) / 1_000_000_000,
      totalVaultedSol: Number(round.totalVaulted) / 1_000_000_000,
      totalWinningsSol: Number(round.totalWinnings) / 1_000_000_000,
      motherlodeOre: Number(round.motherlode) / 10 ** ORE_DECIMALS,
      totalMiners: Number(round.totalMiners),
      expiresAt: Number(round.expiresAt),
    };
  }

  /** Get combined account info (miner + stake) for a wallet */
  async getAccountInfo(walletAddress: string, roundId?: number): Promise<OreAccountInfoResponseType> {
    const walletPubkey = new PublicKey(walletAddress);

    // Fetch both miner and stake accounts (they may or may not exist)
    const miner = await this.getMinerAccount(walletAddress);
    const stake = await this.getStakeAccount(walletAddress);

    // Get current round from board if no roundId specified
    const board = await this.getBoardAccount();
    const currentRoundId = roundId !== undefined ? BigInt(roundId) : board.roundId;

    // Build deployment per square (1-25)
    // Only show miner's deployed amounts if they participated in the requested round
    const deployedSol: Record<string, number> = {};
    const minerParticipatedInRound = miner && miner.roundId === currentRoundId;
    for (let i = 0; i < 25; i++) {
      deployedSol[(i + 1).toString()] = minerParticipatedInRound ? Number(miner.deployed[i]) / 1_000_000_000 : 0;
    }

    const [minerPDA] = OreConfig.getMinerPDA(walletPubkey);
    const [stakePDA] = OreConfig.getStakePDA(walletPubkey);

    const ORE_DECIMALS = 11;

    return {
      // Account addresses
      mineAddress: miner ? minerPDA.toBase58() : null,
      stakeAddress: stake ? stakePDA.toBase58() : null,
      // Mine info
      lastRound: miner ? Number(miner.roundId) : null,
      checkedRound: miner ? Number(miner.checkpointId) : null,
      currentRound: {
        roundId: Number(currentRoundId),
        deployedSol,
      },
      rewardsSol: miner ? Number(miner.rewardsSol) / 1_000_000_000 : 0,
      rewardsOre: miner ? Number(miner.rewardsOre) / 10 ** ORE_DECIMALS : 0,
      lifetimeRewardsSol: miner ? Number(miner.lifetimeRewardsSol) / 1_000_000_000 : 0,
      lifetimeRewardsOre: miner ? Number(miner.lifetimeRewardsOre) / 10 ** ORE_DECIMALS : 0,
      lifetimeDeployed: miner ? Number(miner.lifetimeDeployed) / 1_000_000_000 : 0,
      // Stake info
      stakedOre: stake ? Number(stake.balance) / 10 ** ORE_DECIMALS : 0,
      stakeRewardsOre: stake ? Number(stake.rewards) / 10 ** ORE_DECIMALS : 0,
      lifetimeStakeRewardsOre: stake ? Number(stake.lifetimeRewards) / 10 ** ORE_DECIMALS : 0,
    };
  }

  /** Get system info (treasury + token supply) */
  async getSystemInfo(): Promise<OreSystemInfoResponseType> {
    const treasury = await this.getTreasuryAccount();

    const [treasuryPDA] = OreConfig.getTreasuryPDA();

    // Fetch ORE token supply from mint
    const tokenSupplyInfo = await this.solana.connection.getTokenSupply(OreConfig.ORE_TOKEN_MINT);
    const circulatingSupplyRaw = BigInt(tokenSupplyInfo.value.amount);

    const ORE_DECIMALS = 11;
    const MAX_SUPPLY_ORE = 5_000_000; // 5 million ORE max supply

    // Circulating supply from token mint
    const circulatingSupplyOre = Number(circulatingSupplyRaw) / 10 ** ORE_DECIMALS;

    // Buried = totalRefined - circulatingSupply (refined but burned)
    const totalRefinedOre = Number(treasury.totalRefined) / 10 ** ORE_DECIMALS;
    const buriedOre = Math.max(0, totalRefinedOre - circulatingSupplyOre);

    return {
      treasuryAddress: treasuryPDA.toBase58(),
      treasuryBalanceSol: Number(treasury.balance) / 1_000_000_000,
      maxSupplyOre: MAX_SUPPLY_ORE,
      circulatingSupplyOre,
      buriedOre,
      totalRefinedOre,
      totalStakedOre: Number(treasury.totalStaked) / 10 ** ORE_DECIMALS,
      totalUnclaimedOre: Number(treasury.totalUnclaimed) / 10 ** ORE_DECIMALS,
      motherlodeOre: Number(treasury.motherlode) / 10 ** ORE_DECIMALS,
    };
  }

  // ============================================================================
  // Wallet Helpers (for hardware wallet support)
  // ============================================================================

  /** Prepare wallet for transaction signing */
  public async prepareWallet(walletAddress: string): Promise<{
    wallet: Keypair | PublicKey;
    isHardwareWallet: boolean;
  }> {
    const isHardwareWallet = await this.solana.isHardwareWallet(walletAddress);
    const wallet = isHardwareWallet ? new PublicKey(walletAddress) : await this.solana.getWallet(walletAddress);

    return { wallet, isHardwareWallet };
  }

  /** Sign and send transaction (with hardware wallet support) */
  public async signAndSendTransaction(
    transaction: VersionedTransaction | Transaction,
    walletAddress: string,
    isHardwareWallet: boolean,
  ): Promise<string> {
    if (isHardwareWallet) {
      logger.info(`Hardware wallet detected for ${walletAddress}. Signing transaction with Ledger.`);
      const ledger = new SolanaLedger();
      const signedTx = await ledger.signTransaction(walletAddress, transaction);
      const signature = await this.solana.connection.sendRawTransaction(signedTx.serialize());
      await this.solana.connection.confirmTransaction(signature, 'confirmed');
      return signature;
    } else {
      // Regular wallet signing
      const wallet = await this.solana.getWallet(walletAddress);
      if (transaction instanceof Transaction) {
        transaction.sign(wallet);
        const signature = await this.solana.connection.sendRawTransaction(transaction.serialize());
        await this.solana.connection.confirmTransaction(signature, 'confirmed');
        return signature;
      } else {
        // VersionedTransaction
        transaction.sign([wallet]);
        const signature = await this.solana.connection.sendRawTransaction(transaction.serialize());
        await this.solana.connection.confirmTransaction(signature, 'confirmed');
        return signature;
      }
    }
  }
}
