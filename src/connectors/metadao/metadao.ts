import { BN } from '@coral-xyz/anchor';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { PublicKey, TransactionInstruction, SystemProgram, Connection } from '@solana/web3.js';
import Decimal from 'decimal.js';

import { Solana } from '../../chains/solana/solana';
import { logger } from '../../services/logger';
import { fetchTokenInfo } from '../../tokens/token-lookup-helper';

import { MetaDaoConfig } from './metadao.config';

// Constants for fee calculations
const BPS_SCALE = new BN(10000);
const DEFAULT_PROTOCOL_FEE_BPS = 25;
const DEFAULT_LP_FEE_BPS = 25;
const ANCHOR_DISCRIMINATOR_SIZE = 8;
const U64_SIZE = 8;
const U128_SIZE = 16;
const LP_LIQUIDITY_SCALE_DECIMALS = 9;
// TwapOracle serialized size in the current MetaDAO futarchy program.
const TWAP_ORACLE_SIZE = 100;

// Pool state types matching on-chain structure
interface Pool {
  baseReserves: BN;
  quoteReserves: BN;
  baseProtocolFees: BN;
  quoteProtocolFees: BN;
}

interface PoolStateFutarchy {
  spot: Pool;
  pass: Pool;
  fail: Pool;
}

// PoolState is either a single spot pool or a futarchy state with 3 pools
type PoolState = { spot: Pool } | { futarchy: PoolStateFutarchy };

interface DaoAccount {
  treasuryPdaBump: number;
  protocolFeeBps: number;
  lpFeeBps: number;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  ammBaseVault: PublicKey;
  ammQuoteVault: PublicKey;
  protocolFeeBaseVault: PublicKey;
  protocolFeeQuoteVault: PublicKey;
  totalLiquidity: BN;
  amm: {
    state: PoolState;
  };
}

type ProposalState =
  | { pending: Record<string, never> }
  | { passed: Record<string, never> }
  | { failed: Record<string, never> };

interface ProposalAccount {
  dao: PublicKey;
  number: BN;
  state: ProposalState;
  launchedAt: BN;
  tradingEndSlot: BN;
  baseVault: PublicKey;
  quoteVault: PublicKey;
  question: PublicKey;
  passBaseMint: PublicKey;
  passQuoteMint: PublicKey;
  failBaseMint: PublicKey;
  failQuoteMint: PublicKey;
}

interface AmmPositionAccount {
  authority: PublicKey;
  liquidity: BN;
}

export interface ProposalPdas {
  question: PublicKey;
  baseVault: PublicKey;
  quoteVault: PublicKey;
  passBaseMint: PublicKey;
  passQuoteMint: PublicKey;
  failBaseMint: PublicKey;
  failQuoteMint: PublicKey;
}

export interface SwapQuoteResult {
  output: BN;
  priceImpact: number;
  protocolFee: BN;
  lpFee: BN;
}

export class MetaDao {
  private static _instances: { [network: string]: MetaDao } = {};
  private solana: Solana;
  private connection: Connection;
  private programId: PublicKey;
  private network: string;
  public config: MetaDaoConfig.RootConfig;

  private constructor() {
    this.config = MetaDaoConfig.config;
  }

  public static async getInstance(network: string): Promise<MetaDao> {
    if (!MetaDao._instances[network]) {
      const instance = new MetaDao();
      await instance.init(network);
      MetaDao._instances[network] = instance;
    }
    return MetaDao._instances[network];
  }

  private async init(network: string): Promise<void> {
    this.network = network;
    this.solana = await Solana.getInstance(network);
    this.connection = this.solana.connection;
    this.programId = new PublicKey(this.config.programId);

    logger.info(`MetaDAO connector initialized for network: ${network}`);
  }

  // ============================================================================
  // DAO Discovery Methods
  // ============================================================================

  /**
   * List all DAO addresses (lightweight - no parsing, no extra RPC calls)
   */
  async listDaos(): Promise<string[]> {
    // DAO discriminator: sha256('account:Dao')[0..8] = a3092f1f3455c531 = 'owkvHzRVxTE=' in base64
    const DAO_DISCRIMINATOR_BASE64 = 'owkvHzRVxTE=';

    const accounts = await this.connection.getProgramAccounts(this.programId, {
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: DAO_DISCRIMINATOR_BASE64,
            encoding: 'base64',
          },
        },
      ],
      dataSlice: { offset: 0, length: 0 }, // Don't fetch data, just addresses
    });

    logger.info(`Found ${accounts.length} DAO accounts for MetaDAO program`);
    return accounts.map(({ pubkey }) => pubkey.toString());
  }

  /**
   * Get detailed info for a single DAO
   */
  async getDaoInfo(daoAddress: string): Promise<{
    address: string;
    baseMint: string;
    quoteMint: string;
    baseSymbol: string;
    quoteSymbol: string;
    poolState: 'spot' | 'futarchy';
    totalLiquidity: number;
    totalLiquidityRaw: string;
    protocolFeeBps: number;
    lpFeeBps: number;
  }> {
    const daoAccount = await this.getDao(daoAddress);
    const poolState = this.getPoolStateType(daoAccount);

    const quoteDecimals = await this.getTokenDecimals(daoAccount.quoteMint.toString());
    const baseSymbol = await this.getTokenSymbol(daoAccount.baseMint.toString());
    const quoteSymbol = await this.getTokenSymbol(daoAccount.quoteMint.toString());

    return {
      address: daoAddress,
      baseMint: daoAccount.baseMint.toString(),
      quoteMint: daoAccount.quoteMint.toString(),
      baseSymbol,
      quoteSymbol,
      poolState,
      totalLiquidity: this.fromRawLiquidity(daoAccount.totalLiquidity, quoteDecimals),
      totalLiquidityRaw: daoAccount.totalLiquidity.toString(),
      protocolFeeBps: daoAccount.protocolFeeBps,
      lpFeeBps: daoAccount.lpFeeBps,
    };
  }

  /**
   * List proposals for a specific DAO.
   * Note: This uses getProgramAccounts which may be slow on mainnet.
   */
  async listProposals(
    daoAddress: string,
    statusFilter: 'pending' | 'passed' | 'failed' | 'all' = 'pending',
  ): Promise<
    Array<{
      address: string;
      number?: number;
      status: 'pending' | 'passed' | 'failed';
      launchedAt: number;
      tradingEndsAt: number;
      passBaseMint: string;
      passQuoteMint: string;
      failBaseMint: string;
      failQuoteMint: string;
      passPool: {
        baseReserves: number;
        quoteReserves: number;
        baseReservesRaw: string;
        quoteReservesRaw: string;
        price: number;
      };
      failPool: {
        baseReserves: number;
        quoteReserves: number;
        baseReservesRaw: string;
        quoteReservesRaw: string;
        price: number;
      };
      impliedProbability: number;
    }>
  > {
    const dao = new PublicKey(daoAddress);

    // Proposal has a variable-size state enum, so DAO is not at a stable memcmp offset for drafts.
    // Fetch proposal accounts by discriminator and filter after decoding.
    const PROPOSAL_DISCRIMINATOR_BASE64 = 'Gl69u3SINSE=';
    const accounts = await this.connection.getProgramAccounts(this.programId, {
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: PROPOSAL_DISCRIMINATOR_BASE64,
            encoding: 'base64',
          },
        },
      ],
    });

    const daoAccount = await this.getDao(daoAddress);
    const baseDecimals = await this.getTokenDecimals(daoAccount.baseMint.toString());
    const quoteDecimals = await this.getTokenDecimals(daoAccount.quoteMint.toString());

    const proposals: Array<{
      address: string;
      number?: number;
      status: 'pending' | 'passed' | 'failed';
      launchedAt: number;
      tradingEndsAt: number;
      passBaseMint: string;
      passQuoteMint: string;
      failBaseMint: string;
      failQuoteMint: string;
      passPool: {
        baseReserves: number;
        quoteReserves: number;
        baseReservesRaw: string;
        quoteReservesRaw: string;
        price: number;
      };
      failPool: {
        baseReserves: number;
        quoteReserves: number;
        baseReservesRaw: string;
        quoteReservesRaw: string;
        price: number;
      };
      impliedProbability: number;
    }> = [];

    for (const { pubkey, account } of accounts) {
      try {
        const proposalAccount = this.parseProposalAccount(account.data);
        if (!proposalAccount.dao.equals(dao)) {
          continue;
        }

        const status = this.getProposalState(proposalAccount);

        // Apply status filter
        if (statusFilter !== 'all' && status !== statusFilter) {
          continue;
        }

        // Get pool reserves from DAO if in futarchy state
        let passPool = {
          baseReserves: 0,
          quoteReserves: 0,
          baseReservesRaw: '0',
          quoteReservesRaw: '0',
          price: 0,
        };
        let failPool = {
          baseReserves: 0,
          quoteReserves: 0,
          baseReservesRaw: '0',
          quoteReservesRaw: '0',
          price: 0,
        };

        const passPoolData = this.getPassPool(daoAccount);
        const failPoolData = this.getFailPool(daoAccount);

        if (passPoolData) {
          const baseReserves = this.fromRawAmount(passPoolData.baseReserves, baseDecimals);
          const quoteReserves = this.fromRawAmount(passPoolData.quoteReserves, quoteDecimals);
          passPool = {
            baseReserves,
            quoteReserves,
            baseReservesRaw: passPoolData.baseReserves.toString(),
            quoteReservesRaw: passPoolData.quoteReserves.toString(),
            price: baseReserves > 0 ? quoteReserves / baseReserves : 0,
          };
        }

        if (failPoolData) {
          const baseReserves = this.fromRawAmount(failPoolData.baseReserves, baseDecimals);
          const quoteReserves = this.fromRawAmount(failPoolData.quoteReserves, quoteDecimals);
          failPool = {
            baseReserves,
            quoteReserves,
            baseReservesRaw: failPoolData.baseReserves.toString(),
            quoteReservesRaw: failPoolData.quoteReserves.toString(),
            price: baseReserves > 0 ? quoteReserves / baseReserves : 0,
          };
        }

        // Calculate implied probability from pool prices
        // P(pass) = passPrice / (passPrice + failPrice)
        const impliedProbability =
          passPool.price + failPool.price > 0 ? (passPool.price / (passPool.price + failPool.price)) * 100 : 50;

        proposals.push({
          address: pubkey.toString(),
          number: proposalAccount.number.toNumber(),
          status,
          launchedAt: proposalAccount.launchedAt.toNumber(),
          tradingEndsAt: proposalAccount.tradingEndSlot.toNumber(),
          passBaseMint: proposalAccount.passBaseMint.toString(),
          passQuoteMint: proposalAccount.passQuoteMint.toString(),
          failBaseMint: proposalAccount.failBaseMint.toString(),
          failQuoteMint: proposalAccount.failQuoteMint.toString(),
          passPool,
          failPool,
          impliedProbability,
        });
      } catch (error) {
        logger.warn(`Failed to parse proposal ${pubkey.toString()}: ${error}`);
      }
    }

    return proposals;
  }

  // ============================================================================
  // DAO Methods
  // ============================================================================

  async getDao(daoAddress: string): Promise<DaoAccount> {
    const dao = new PublicKey(daoAddress);
    const accountInfo = await this.connection.getAccountInfo(dao);
    if (!accountInfo) {
      throw new Error(`DAO account not found: ${daoAddress}`);
    }
    // Parse DAO account data (simplified - real implementation would use proper deserialization)
    return this.parseDaoAccount(accountInfo.data, dao);
  }

  private parseDaoAccount(data: Buffer, _pubkey: PublicKey): DaoAccount {
    let offset = ANCHOR_DISCRIMINATOR_SIZE;

    const stateDiscriminant = data.readUInt8(offset);
    offset += 1;

    let ammState: PoolState;
    if (stateDiscriminant === 0) {
      const parsed = this.parsePool(data, offset);
      offset = parsed.nextOffset;
      ammState = { spot: parsed.pool };
    } else if (stateDiscriminant === 1) {
      const spot = this.parsePool(data, offset);
      const pass = this.parsePool(data, spot.nextOffset);
      const fail = this.parsePool(data, pass.nextOffset);
      offset = fail.nextOffset;

      ammState = {
        futarchy: {
          spot: spot.pool,
          pass: pass.pool,
          fail: fail.pool,
        },
      };
    } else {
      throw new Error(`Unknown DAO AMM pool state discriminant: ${stateDiscriminant}`);
    }

    const totalLiquidity = this.readU128(data, offset);
    offset += U128_SIZE;

    // Skip amm_base_mint (32 bytes)
    offset += 32;

    // Skip amm_quote_mint (32 bytes)
    offset += 32;

    const ammBaseVault = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const ammQuoteVault = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    offset += U64_SIZE; // nonce
    offset += 32; // dao_creator
    const treasuryPdaBump = data.readUInt8(offset);
    offset += 1;
    offset += 32; // squads_multisig
    offset += 32; // squads_multisig_vault

    const daoBaseMint = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const daoQuoteMint = new PublicKey(data.slice(offset, offset + 32));

    return {
      treasuryPdaBump,
      protocolFeeBps: DEFAULT_PROTOCOL_FEE_BPS,
      lpFeeBps: DEFAULT_LP_FEE_BPS,
      baseMint: daoBaseMint,
      quoteMint: daoQuoteMint,
      ammBaseVault,
      ammQuoteVault,
      protocolFeeBaseVault: ammBaseVault,
      protocolFeeQuoteVault: ammQuoteVault,
      totalLiquidity,
      amm: { state: ammState },
    };
  }

  private parsePool(data: Buffer, offset: number): { pool: Pool; nextOffset: number } {
    offset += TWAP_ORACLE_SIZE;

    const quoteReserves = this.readU64(data, offset);
    offset += U64_SIZE;

    const baseReserves = this.readU64(data, offset);
    offset += U64_SIZE;

    const quoteProtocolFees = this.readU64(data, offset);
    offset += U64_SIZE;

    const baseProtocolFees = this.readU64(data, offset);
    offset += U64_SIZE;

    return {
      pool: {
        baseReserves,
        quoteReserves,
        baseProtocolFees,
        quoteProtocolFees,
      },
      nextOffset: offset,
    };
  }

  private readU64(data: Buffer, offset: number): BN {
    return new BN(data.slice(offset, offset + U64_SIZE), 'le');
  }

  private readU128(data: Buffer, offset: number): BN {
    return new BN(data.slice(offset, offset + U128_SIZE), 'le');
  }

  // ============================================================================
  // Proposal Methods
  // ============================================================================

  async getProposal(proposalAddress: string): Promise<ProposalAccount> {
    const proposal = new PublicKey(proposalAddress);
    const accountInfo = await this.connection.getAccountInfo(proposal);
    if (!accountInfo) {
      throw new Error(`Proposal account not found: ${proposalAddress}`);
    }
    return this.parseProposalAccount(accountInfo.data);
  }

  private parseProposalAccount(data: Buffer): ProposalAccount {
    // Skip discriminator (8 bytes)
    let offset = 8;

    const number = new BN(data.readUInt32LE(offset));
    offset += 4;

    offset += 32; // proposer

    const launchedAt = new BN(data.slice(offset, offset + 8), 'le');
    offset += 8;

    const stateDiscriminant = data.readUInt8(offset);
    offset += 1;

    // ProposalState enum variants have different sizes:
    // - Draft (0): amount_staked (u64) = 8 bytes
    // - Pending (1), Passed (2), Failed (3), Removed (4): no payload
    if (stateDiscriminant === 0) {
      offset += U64_SIZE; // Draft.amount_staked
    }

    let state: ProposalState;
    if (stateDiscriminant === 0 || stateDiscriminant === 1) {
      state = { pending: {} };
    } else if (stateDiscriminant === 2) {
      state = { passed: {} };
    } else {
      state = { failed: {} };
    }

    const baseVault = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const quoteVault = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const dao = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    offset += 1; // pda_bump

    const question = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const durationInSeconds = new BN(data.readUInt32LE(offset));
    offset += 4;

    offset += 32; // squads_proposal

    const passBaseMint = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const passQuoteMint = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const failBaseMint = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const failQuoteMint = new PublicKey(data.slice(offset, offset + 32));

    const tradingEndSlot = launchedAt.add(durationInSeconds);

    return {
      dao,
      number,
      state,
      launchedAt,
      tradingEndSlot,
      baseVault,
      quoteVault,
      question,
      passBaseMint,
      passQuoteMint,
      failBaseMint,
      failQuoteMint,
    };
  }

  getProposalState(proposal: ProposalAccount): 'pending' | 'passed' | 'failed' {
    if ('pending' in proposal.state) return 'pending';
    if ('passed' in proposal.state) return 'passed';
    if ('failed' in proposal.state) return 'failed';
    throw new Error('Unknown proposal state');
  }

  /**
   * Get full proposal information including DAO data and market reserves
   */
  async getProposalInfo(
    daoAddress: string | undefined,
    proposalAddress: string,
  ): Promise<{
    proposal: string;
    dao: string;
    number: number;
    status: 'pending' | 'passed' | 'failed';
    launchedAt: number;
    tradingEndsAt: number;
    baseMint: string;
    quoteMint: string;
    baseSymbol: string;
    quoteSymbol: string;
    pdas: ProposalPdas;
    passPool: {
      baseReserves: number;
      quoteReserves: number;
      baseReservesRaw: string;
      quoteReservesRaw: string;
      price: number;
    };
    failPool: {
      baseReserves: number;
      quoteReserves: number;
      baseReservesRaw: string;
      quoteReservesRaw: string;
      price: number;
    };
    impliedProbability: number;
    passMarketCap?: number;
    failMarketCap?: number;
  }> {
    const proposalAccount = await this.getProposal(proposalAddress);
    const resolvedDaoAddress = daoAddress || proposalAccount.dao.toString();
    if (daoAddress && !proposalAccount.dao.equals(new PublicKey(daoAddress))) {
      throw new Error(
        `Proposal ${proposalAddress} belongs to DAO ${proposalAccount.dao.toString()}, not ${daoAddress}`,
      );
    }

    const daoAccount = await this.getDao(resolvedDaoAddress);

    const baseDecimals = await this.getTokenDecimals(daoAccount.baseMint.toString());
    const quoteDecimals = await this.getTokenDecimals(daoAccount.quoteMint.toString());
    const baseSymbol = await this.getTokenSymbol(daoAccount.baseMint.toString());
    const quoteSymbol = await this.getTokenSymbol(daoAccount.quoteMint.toString());

    const pdas = {
      question: proposalAccount.question,
      baseVault: proposalAccount.baseVault,
      quoteVault: proposalAccount.quoteVault,
      passBaseMint: proposalAccount.passBaseMint,
      passQuoteMint: proposalAccount.passQuoteMint,
      failBaseMint: proposalAccount.failBaseMint,
      failQuoteMint: proposalAccount.failQuoteMint,
    };

    // Get pool reserves
    let passPool = {
      baseReserves: 0,
      quoteReserves: 0,
      baseReservesRaw: '0',
      quoteReservesRaw: '0',
      price: 0,
    };
    let failPool = {
      baseReserves: 0,
      quoteReserves: 0,
      baseReservesRaw: '0',
      quoteReservesRaw: '0',
      price: 0,
    };

    const passPoolData = this.getPassPool(daoAccount);
    const failPoolData = this.getFailPool(daoAccount);

    if (passPoolData) {
      const baseReserves = this.fromRawAmount(passPoolData.baseReserves, baseDecimals);
      const quoteReserves = this.fromRawAmount(passPoolData.quoteReserves, quoteDecimals);
      passPool = {
        baseReserves,
        quoteReserves,
        baseReservesRaw: passPoolData.baseReserves.toString(),
        quoteReservesRaw: passPoolData.quoteReserves.toString(),
        price: baseReserves > 0 ? quoteReserves / baseReserves : 0,
      };
    }

    if (failPoolData) {
      const baseReserves = this.fromRawAmount(failPoolData.baseReserves, baseDecimals);
      const quoteReserves = this.fromRawAmount(failPoolData.quoteReserves, quoteDecimals);
      failPool = {
        baseReserves,
        quoteReserves,
        baseReservesRaw: failPoolData.baseReserves.toString(),
        quoteReservesRaw: failPoolData.quoteReserves.toString(),
        price: baseReserves > 0 ? quoteReserves / baseReserves : 0,
      };
    }

    // Calculate implied probability: P(pass) = passPrice / (passPrice + failPrice)
    const impliedProbability =
      passPool.price + failPool.price > 0 ? (passPool.price / (passPool.price + failPool.price)) * 100 : 50;

    return {
      proposal: proposalAddress,
      dao: resolvedDaoAddress,
      number: proposalAccount.number.toNumber(),
      status: this.getProposalState(proposalAccount),
      launchedAt: proposalAccount.launchedAt.toNumber(),
      tradingEndsAt: proposalAccount.tradingEndSlot.toNumber(),
      baseMint: daoAccount.baseMint.toString(),
      quoteMint: daoAccount.quoteMint.toString(),
      baseSymbol,
      quoteSymbol,
      pdas,
      passPool,
      failPool,
      impliedProbability,
      passMarketCap: passPool.baseReserves * passPool.price,
      failMarketCap: failPool.baseReserves * failPool.price,
    };
  }

  /**
   * Derive all proposal-related PDAs for conditional tokens
   */
  async getProposalPdas(_daoAddress: string, proposalAddress: string): Promise<ProposalPdas> {
    const proposal = new PublicKey(proposalAddress);
    const conditionalVaultProgram = new PublicKey(this.config.conditionalVaultProgramId);
    const futarchyProgram = new PublicKey(this.config.programId);

    // Derive question PDA
    const [question] = PublicKey.findProgramAddressSync(
      [Buffer.from('question'), proposal.toBuffer()],
      futarchyProgram,
    );

    // Derive base vault PDA
    const [baseVault] = PublicKey.findProgramAddressSync(
      [Buffer.from('conditional_vault'), question.toBuffer(), Buffer.from([0])],
      conditionalVaultProgram,
    );

    // Derive quote vault PDA
    const [quoteVault] = PublicKey.findProgramAddressSync(
      [Buffer.from('conditional_vault'), question.toBuffer(), Buffer.from([1])],
      conditionalVaultProgram,
    );

    // Derive conditional token mints
    // Pass = outcome index 0, Fail = outcome index 1
    const [passBaseMint] = PublicKey.findProgramAddressSync(
      [Buffer.from('conditional_mint'), baseVault.toBuffer(), Buffer.from([0])],
      conditionalVaultProgram,
    );

    const [failBaseMint] = PublicKey.findProgramAddressSync(
      [Buffer.from('conditional_mint'), baseVault.toBuffer(), Buffer.from([1])],
      conditionalVaultProgram,
    );

    const [passQuoteMint] = PublicKey.findProgramAddressSync(
      [Buffer.from('conditional_mint'), quoteVault.toBuffer(), Buffer.from([0])],
      conditionalVaultProgram,
    );

    const [failQuoteMint] = PublicKey.findProgramAddressSync(
      [Buffer.from('conditional_mint'), quoteVault.toBuffer(), Buffer.from([1])],
      conditionalVaultProgram,
    );

    return {
      question,
      baseVault,
      quoteVault,
      passBaseMint,
      passQuoteMint,
      failBaseMint,
      failQuoteMint,
    };
  }

  // ============================================================================
  // LP Position Methods
  // ============================================================================

  getAmmPositionAddress(daoAddress: string, authority: string): PublicKey {
    const dao = new PublicKey(daoAddress);
    const auth = new PublicKey(authority);
    const futarchyProgram = new PublicKey(this.config.programId);

    const [ammPosition] = PublicKey.findProgramAddressSync(
      [Buffer.from('amm_position'), dao.toBuffer(), auth.toBuffer()],
      futarchyProgram,
    );

    return ammPosition;
  }

  async getAmmPosition(daoAddress: string, authority: string): Promise<AmmPositionAccount | null> {
    try {
      const positionAddress = this.getAmmPositionAddress(daoAddress, authority);
      const accountInfo = await this.connection.getAccountInfo(positionAddress);
      if (!accountInfo) {
        return null;
      }
      return this.parseAmmPositionAccount(accountInfo.data);
    } catch {
      return null;
    }
  }

  private parseAmmPositionAccount(data: Buffer): AmmPositionAccount {
    // Skip discriminator (8 bytes)
    let offset = 8;

    const authority = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const liquidity = new BN(data.slice(offset, offset + 8), 'le');

    return { authority, liquidity };
  }

  // ============================================================================
  // Quote Methods
  // ============================================================================

  /**
   * Calculate swap output using MetaDAO's fee structure:
   * Protocol fee first, then LP fee, then constant product formula
   */
  calculateSwapOutput(
    inputAmount: BN,
    inputReserves: BN,
    outputReserves: BN,
    protocolFeeBps: number = DEFAULT_PROTOCOL_FEE_BPS,
    lpFeeBps: number = DEFAULT_LP_FEE_BPS,
  ): SwapQuoteResult {
    // MetaDAO applies protocol fee first, then LP fee, before the AMM curve
    const protocolFeeMultiplier = BPS_SCALE.sub(new BN(protocolFeeBps));
    const lpFeeMultiplier = BPS_SCALE.sub(new BN(lpFeeBps));

    // Calculate fees
    const protocolFee = inputAmount.mul(new BN(protocolFeeBps)).div(BPS_SCALE);
    const inputAfterProtocolFee = inputAmount.mul(protocolFeeMultiplier).div(BPS_SCALE);

    const lpFee = inputAfterProtocolFee.mul(new BN(lpFeeBps)).div(BPS_SCALE);
    const inputAfterLpFee = inputAfterProtocolFee.mul(lpFeeMultiplier).div(BPS_SCALE);

    // Constant product formula: output = inputAfterFees * outputReserves / (inputReserves + inputAfterFees)
    const numerator = inputAfterLpFee.mul(outputReserves);
    const denominator = inputReserves.add(inputAfterLpFee);
    const output = numerator.div(denominator);

    // Calculate price impact using Decimal for precision
    const spotPrice = new Decimal(outputReserves.toString()).div(inputReserves.toString());
    const execPrice = output.isZero() ? new Decimal(0) : new Decimal(output.toString()).div(inputAmount.toString());
    const priceImpact = spotPrice.isZero() ? 0 : spotPrice.minus(execPrice).abs().div(spotPrice).mul(100).toNumber();

    return { output, priceImpact, protocolFee, lpFee };
  }

  calculateSwapInputForOutput(
    outputAmount: BN,
    inputReserves: BN,
    outputReserves: BN,
    protocolFeeBps: number = DEFAULT_PROTOCOL_FEE_BPS,
    lpFeeBps: number = DEFAULT_LP_FEE_BPS,
  ): BN {
    if (outputAmount.gte(outputReserves)) {
      throw new Error('Requested output amount exceeds available reserves');
    }

    const feeMultiplier = BPS_SCALE.sub(new BN(protocolFeeBps)).mul(BPS_SCALE.sub(new BN(lpFeeBps)));
    const numerator = inputReserves.mul(outputAmount).mul(BPS_SCALE).mul(BPS_SCALE);
    const denominator = outputReserves.sub(outputAmount).mul(feeMultiplier);

    return numerator.add(denominator).sub(new BN(1)).div(denominator);
  }

  /**
   * Calculate liquidity tokens to mint for a deposit
   */
  calculateLiquidityMint(
    quoteAmount: BN,
    baseReserves: BN,
    quoteReserves: BN,
    totalLiquidity: BN,
  ): { baseAmount: BN; liquidityMinted: BN } {
    if (totalLiquidity.isZero()) {
      // Initial deposit: liquidity = quoteAmount * 1_000_000_000
      const liquidityMinted = quoteAmount.mul(new BN(1_000_000_000));
      return { baseAmount: quoteAmount, liquidityMinted };
    }

    // Calculate base amount: ceil(quoteAmount * baseReserves / quoteReserves)
    const baseAmount = quoteAmount
      .mul(baseReserves)
      .add(quoteReserves.sub(new BN(1)))
      .div(quoteReserves);

    // Calculate liquidity tokens: quoteAmount * totalLiquidity / quoteReserves
    const liquidityMinted = quoteAmount.mul(totalLiquidity).div(quoteReserves);

    return { baseAmount, liquidityMinted };
  }

  /**
   * Calculate tokens to receive for liquidity withdrawal
   */
  calculateLiquidityWithdraw(
    liquidityAmount: BN,
    baseReserves: BN,
    quoteReserves: BN,
    totalLiquidity: BN,
  ): { baseAmount: BN; quoteAmount: BN } {
    const baseAmount = liquidityAmount.mul(baseReserves).div(totalLiquidity);
    const quoteAmount = liquidityAmount.mul(quoteReserves).div(totalLiquidity);

    return { baseAmount, quoteAmount };
  }

  // ============================================================================
  // Instruction Builders
  // ============================================================================

  async buildSpotSwapIx(params: {
    dao: PublicKey;
    trader: PublicKey;
    swapType: 'buy' | 'sell';
    inputAmount: BN;
    minOutputAmount: BN;
  }): Promise<TransactionInstruction> {
    const daoAccount = await this.getDao(params.dao.toString());

    // Get token programs for base and quote mints
    const baseTokenProgramId = await this.getTokenProgramId(daoAccount.baseMint);
    const quoteTokenProgramId = await this.getTokenProgramId(daoAccount.quoteMint);

    // Get trader's token accounts with correct token program
    const traderBaseAccount = getAssociatedTokenAddressSync(
      daoAccount.baseMint,
      params.trader,
      false,
      baseTokenProgramId,
    );
    const traderQuoteAccount = getAssociatedTokenAddressSync(
      daoAccount.quoteMint,
      params.trader,
      false,
      quoteTokenProgramId,
    );

    // Build instruction data: discriminator + swapType + inputAmount + minOutputAmount
    const discriminator = new Uint8Array([0xa7, 0x61, 0x0c, 0xe7, 0xed, 0x4e, 0xa6, 0xfb]);
    const swapTypeData = new Uint8Array([params.swapType === 'buy' ? 0 : 1]);
    const inputAmountData = new Uint8Array(params.inputAmount.toArrayLike(Buffer, 'le', 8));
    const minOutputAmountData = new Uint8Array(params.minOutputAmount.toArrayLike(Buffer, 'le', 8));

    const data = Buffer.from([...discriminator, ...swapTypeData, ...inputAmountData, ...minOutputAmountData]);

    const keys = [
      { pubkey: params.dao, isSigner: false, isWritable: true },
      { pubkey: params.trader, isSigner: true, isWritable: true },
      { pubkey: daoAccount.baseMint, isSigner: false, isWritable: false },
      { pubkey: daoAccount.quoteMint, isSigner: false, isWritable: false },
      { pubkey: daoAccount.ammBaseVault, isSigner: false, isWritable: true },
      { pubkey: daoAccount.ammQuoteVault, isSigner: false, isWritable: true },
      { pubkey: traderBaseAccount, isSigner: false, isWritable: true },
      { pubkey: traderQuoteAccount, isSigner: false, isWritable: true },
      { pubkey: daoAccount.protocolFeeBaseVault, isSigner: false, isWritable: true },
      { pubkey: daoAccount.protocolFeeQuoteVault, isSigner: false, isWritable: true },
      { pubkey: baseTokenProgramId, isSigner: false, isWritable: false },
    ];

    return new TransactionInstruction({
      keys,
      programId: this.programId,
      data,
    });
  }

  async buildConditionalSwapIx(params: {
    dao: PublicKey;
    proposal: PublicKey;
    trader: PublicKey;
    market: 'pass' | 'fail';
    swapType: 'buy' | 'sell';
    inputAmount: BN;
    minOutputAmount: BN;
  }): Promise<TransactionInstruction> {
    const pdas = await this.getProposalPdas(params.dao.toString(), params.proposal.toString());

    // Determine input/output mints based on market and swap type
    let inputMint: PublicKey;
    let outputMint: PublicKey;

    if (params.market === 'pass') {
      if (params.swapType === 'buy') {
        inputMint = pdas.passQuoteMint;
        outputMint = pdas.passBaseMint;
      } else {
        inputMint = pdas.passBaseMint;
        outputMint = pdas.passQuoteMint;
      }
    } else {
      if (params.swapType === 'buy') {
        inputMint = pdas.failQuoteMint;
        outputMint = pdas.failBaseMint;
      } else {
        inputMint = pdas.failBaseMint;
        outputMint = pdas.failQuoteMint;
      }
    }

    // Get trader's conditional token accounts
    const traderInputAccount = getAssociatedTokenAddressSync(inputMint, params.trader);
    const traderOutputAccount = getAssociatedTokenAddressSync(outputMint, params.trader);

    // Get conditional vaults - use base vault for base tokens, quote vault for quote tokens
    // For BUY: input is quote conditional → quoteVault, output is base conditional → baseVault
    // For SELL: input is base conditional → baseVault, output is quote conditional → quoteVault
    const inputVault = params.swapType === 'buy' ? pdas.quoteVault : pdas.baseVault;
    const outputVault = params.swapType === 'buy' ? pdas.baseVault : pdas.quoteVault;

    const conditionalInputVault = getAssociatedTokenAddressSync(inputMint, inputVault, true);
    const conditionalOutputVault = getAssociatedTokenAddressSync(outputMint, outputVault, true);

    // Build instruction data: discriminator + market + swapType + inputAmount + minOutputAmount
    const discriminator = new Uint8Array([0xc2, 0x88, 0xdc, 0x59, 0xf2, 0xa9, 0x82, 0x9d]);
    const marketData = new Uint8Array([params.market === 'pass' ? 0 : 1]);
    const swapTypeData = new Uint8Array([params.swapType === 'buy' ? 0 : 1]);
    const inputAmountData = new Uint8Array(params.inputAmount.toArrayLike(Buffer, 'le', 8));
    const minOutputAmountData = new Uint8Array(params.minOutputAmount.toArrayLike(Buffer, 'le', 8));

    const data = Buffer.from([
      ...discriminator,
      ...marketData,
      ...swapTypeData,
      ...inputAmountData,
      ...minOutputAmountData,
    ]);

    const keys = [
      { pubkey: params.dao, isSigner: false, isWritable: true },
      { pubkey: params.proposal, isSigner: false, isWritable: true },
      { pubkey: params.trader, isSigner: true, isWritable: true },
      { pubkey: inputMint, isSigner: false, isWritable: false },
      { pubkey: outputMint, isSigner: false, isWritable: false },
      { pubkey: conditionalInputVault, isSigner: false, isWritable: true },
      { pubkey: conditionalOutputVault, isSigner: false, isWritable: true },
      { pubkey: traderInputAccount, isSigner: false, isWritable: true },
      { pubkey: traderOutputAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    return new TransactionInstruction({
      keys,
      programId: this.programId,
      data,
    });
  }

  async buildProvideLiquidityIx(params: {
    dao: PublicKey;
    liquidityProvider: PublicKey;
    quoteAmount: BN;
    maxBaseAmount: BN;
    minLiquidity: BN;
  }): Promise<TransactionInstruction> {
    const daoAccount = await this.getDao(params.dao.toString());

    // Get LP position PDA
    const ammPosition = this.getAmmPositionAddress(params.dao.toString(), params.liquidityProvider.toString());

    // Get LP's token accounts
    const lpBaseAccount = getAssociatedTokenAddressSync(daoAccount.baseMint, params.liquidityProvider);
    const lpQuoteAccount = getAssociatedTokenAddressSync(daoAccount.quoteMint, params.liquidityProvider);

    // Build instruction data: discriminator + quoteAmount + maxBaseAmount + minLiquidity
    const discriminator = new Uint8Array([0x28, 0x6e, 0x6b, 0x74, 0xae, 0x7f, 0x61, 0xcc]);
    const quoteAmountData = new Uint8Array(params.quoteAmount.toArrayLike(Buffer, 'le', 8));
    const maxBaseAmountData = new Uint8Array(params.maxBaseAmount.toArrayLike(Buffer, 'le', 8));
    const minLiquidityData = new Uint8Array(params.minLiquidity.toArrayLike(Buffer, 'le', 8));

    const data = Buffer.from([...discriminator, ...quoteAmountData, ...maxBaseAmountData, ...minLiquidityData]);

    const keys = [
      { pubkey: params.dao, isSigner: false, isWritable: true },
      { pubkey: params.liquidityProvider, isSigner: true, isWritable: true },
      { pubkey: ammPosition, isSigner: false, isWritable: true },
      { pubkey: daoAccount.baseMint, isSigner: false, isWritable: false },
      { pubkey: daoAccount.quoteMint, isSigner: false, isWritable: false },
      { pubkey: daoAccount.ammBaseVault, isSigner: false, isWritable: true },
      { pubkey: daoAccount.ammQuoteVault, isSigner: false, isWritable: true },
      { pubkey: lpBaseAccount, isSigner: false, isWritable: true },
      { pubkey: lpQuoteAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    return new TransactionInstruction({
      keys,
      programId: this.programId,
      data,
    });
  }

  async buildWithdrawLiquidityIx(params: {
    dao: PublicKey;
    liquidityProvider: PublicKey;
    liquidityAmount: BN;
    minBaseAmount: BN;
    minQuoteAmount: BN;
  }): Promise<TransactionInstruction> {
    const daoAccount = await this.getDao(params.dao.toString());

    // Get LP position PDA
    const ammPosition = this.getAmmPositionAddress(params.dao.toString(), params.liquidityProvider.toString());

    // Get LP's token accounts
    const lpBaseAccount = getAssociatedTokenAddressSync(daoAccount.baseMint, params.liquidityProvider);
    const lpQuoteAccount = getAssociatedTokenAddressSync(daoAccount.quoteMint, params.liquidityProvider);

    // Build instruction data: discriminator + liquidityAmount + minBaseAmount + minQuoteAmount
    const discriminator = new Uint8Array([0x95, 0x9e, 0x21, 0xb9, 0x2f, 0xf3, 0xfd, 0x1f]);
    const liquidityAmountData = new Uint8Array(params.liquidityAmount.toArrayLike(Buffer, 'le', 8));
    const minBaseAmountData = new Uint8Array(params.minBaseAmount.toArrayLike(Buffer, 'le', 8));
    const minQuoteAmountData = new Uint8Array(params.minQuoteAmount.toArrayLike(Buffer, 'le', 8));

    const data = Buffer.from([...discriminator, ...liquidityAmountData, ...minBaseAmountData, ...minQuoteAmountData]);

    const keys = [
      { pubkey: params.dao, isSigner: false, isWritable: true },
      { pubkey: params.liquidityProvider, isSigner: true, isWritable: true },
      { pubkey: ammPosition, isSigner: false, isWritable: true },
      { pubkey: daoAccount.baseMint, isSigner: false, isWritable: false },
      { pubkey: daoAccount.quoteMint, isSigner: false, isWritable: false },
      { pubkey: daoAccount.ammBaseVault, isSigner: false, isWritable: true },
      { pubkey: daoAccount.ammQuoteVault, isSigner: false, isWritable: true },
      { pubkey: lpBaseAccount, isSigner: false, isWritable: true },
      { pubkey: lpQuoteAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    return new TransactionInstruction({
      keys,
      programId: this.programId,
      data,
    });
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  getSolana(): Solana {
    return this.solana;
  }

  getProgramId(): PublicKey {
    return this.programId;
  }

  getNetwork(): string {
    return this.network;
  }

  async getTokenProgramId(mint: PublicKey): Promise<PublicKey> {
    const mintInfo = await this.connection.getAccountInfo(mint);
    if (!mintInfo) {
      throw new Error(`Mint account not found: ${mint.toString()}`);
    }
    // Check if mint is owned by Token-2022 program
    if (mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
      return TOKEN_2022_PROGRAM_ID;
    }
    return TOKEN_PROGRAM_ID;
  }

  async buildCreateAtaIx(owner: PublicKey, mint: PublicKey, payer: PublicKey = owner): Promise<TransactionInstruction> {
    const tokenProgramId = await this.getTokenProgramId(mint);
    const ata = getAssociatedTokenAddressSync(mint, owner, false, tokenProgramId);
    return createAssociatedTokenAccountIdempotentInstruction(payer, ata, owner, mint, tokenProgramId);
  }

  async getTokenDecimals(mint: string): Promise<number> {
    const mintInfo = await this.solana.connection.getParsedAccountInfo(new PublicKey(mint));
    const decimals = (mintInfo.value?.data as any)?.parsed?.info?.decimals;
    if (typeof decimals !== 'number') {
      throw new Error(`Unable to read SPL mint decimals for ${mint}`);
    }
    return decimals;
  }

  /**
   * Convert human-readable amount to raw BN.
   * Use Decimal library to avoid floating point precision loss.
   */
  toRawAmount(amount: string | number, decimals: number): BN {
    const d = new Decimal(amount).mul(new Decimal(10).pow(decimals));
    return new BN(d.toFixed(0)); // Truncate, don't round
  }

  /**
   * Convert raw BN to human-readable number.
   * WARNING: Only use for display purposes. Large amounts may lose precision.
   * For calculations, keep values as BN throughout.
   */
  fromRawAmount(amount: BN, decimals: number): number {
    const d = new Decimal(amount.toString()).div(new Decimal(10).pow(decimals));
    return d.toNumber();
  }

  /**
   * Convert raw BN to string (no precision loss).
   * Preferred over fromRawAmount for API responses.
   */
  fromRawAmountString(amount: BN, decimals: number): string {
    const d = new Decimal(amount.toString()).div(new Decimal(10).pow(decimals));
    return d.toString();
  }

  /**
   * MetaDAO LP liquidity is scaled as raw quote units * 1e9.
   */
  fromRawLiquidity(amount: BN, quoteDecimals: number): number {
    return this.fromRawAmount(amount, quoteDecimals + LP_LIQUIDITY_SCALE_DECIMALS);
  }

  toRawLiquidity(amount: string | number, quoteDecimals: number): BN {
    return this.toRawAmount(amount, quoteDecimals + LP_LIQUIDITY_SCALE_DECIMALS);
  }

  /**
   * Get pool state type
   */
  getPoolStateType(dao: DaoAccount): 'spot' | 'futarchy' {
    if ('spot' in dao.amm.state) return 'spot';
    return 'futarchy';
  }

  /**
   * Get spot pool reserves (works in both spot and futarchy state)
   */
  getSpotPool(dao: DaoAccount): Pool {
    if ('spot' in dao.amm.state) {
      return (dao.amm.state as { spot: Pool }).spot;
    }
    return (dao.amm.state as { futarchy: PoolStateFutarchy }).futarchy.spot;
  }

  /**
   * Get pass pool reserves (only in futarchy state)
   */
  getPassPool(dao: DaoAccount): Pool | null {
    if ('futarchy' in dao.amm.state) {
      return (dao.amm.state as { futarchy: PoolStateFutarchy }).futarchy.pass;
    }
    return null;
  }

  /**
   * Get fail pool reserves (only in futarchy state)
   */
  getFailPool(dao: DaoAccount): Pool | null {
    if ('futarchy' in dao.amm.state) {
      return (dao.amm.state as { futarchy: PoolStateFutarchy }).futarchy.fail;
    }
    return null;
  }

  /**
   * Get token symbol from mint address.
   * First checks local token list, then fetches from GeckoTerminal if not found.
   */
  async getTokenSymbol(mintAddress: string): Promise<string> {
    const tokenInfo = await this.solana.getToken(mintAddress);

    // If found and not a dummy token, return the symbol
    if (tokenInfo?.symbol && !tokenInfo.symbol.startsWith('DUMMY_')) {
      return tokenInfo.symbol;
    }

    // Try to fetch from GeckoTerminal
    try {
      const chainNetwork = `solana-${this.network}`;
      const geckoTokenInfo = await fetchTokenInfo(chainNetwork, mintAddress);
      if (geckoTokenInfo?.symbol) {
        return geckoTokenInfo.symbol;
      }
    } catch (error) {
      logger.debug(`GeckoTerminal lookup failed for ${mintAddress}: ${error}`);
    }

    return mintAddress.slice(0, 8);
  }
}
