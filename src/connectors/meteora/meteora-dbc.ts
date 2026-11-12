/**
 * Meteora Dynamic Bonding Curve (DBC) connector: a token launched from a partner
 * config trades on a virtual pool until its quote reserve reaches the config's
 * migration threshold, then Meteora's keeper migrates it to DAMM v2 (where the
 * `meteora` amm connector takes over). Router-type: quote/execute by token pair,
 * with the pool resolved from the base mint.
 */
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import {
  DynamicBondingCurveClient,
  DynamicBondingCurveIdl,
  PoolConfig,
  VirtualPool,
  deriveDammV1MigrationMetadataAddress,
  deriveDbcEventAuthority,
  deriveDbcPoolAddress,
  getPriceFromSqrtPrice,
  getTokenProgram,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
import { TokenInfo } from '@solana/spl-token-registry';
import { Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js';

import { Solana } from '../../chains/solana/solana';
import { httpErrors } from '../../services/error-handler';
import { sanitizeErrorMessage } from '../../services/sanitize';

import { MeteoraDbcConfig } from './meteora-dbc.config';
import { fromRawAmount } from './meteora-dbc.utils';

/** A virtual pool with the config it was launched from, as one fetch. */
export interface DbcPoolState {
  poolAddress: PublicKey;
  pool: VirtualPool;
  configAddress: PublicKey;
  config: PoolConfig;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  /** Program owning the base mint (Token-2022 for configs with tokenType 1). */
  tokenProgram: PublicKey;
  baseDecimals: number;
  quoteDecimals: number;
  /** True once the curve completed and the pool migrated: trades belong on DAMM v2. */
  isMigrated: boolean;
}

/** What GET /trading/router/pool-info returns for a DBC pool. */
export interface DbcPoolInfo {
  poolAddress: string;
  config: string;
  creator: string;
  baseMint: string;
  quoteMint: string;
  tokenProgram: string;
  isMigrated: boolean;
  /** quoteReserve / migrationQuoteThreshold, clamped to [0, 1]. */
  migrationProgress: number;
  quoteReserve: number;
  migrationQuoteThreshold: number;
  /** Spot price in quote per base, from the pool's sqrt price. */
  price: number;
  sqrtPrice: string;
  totalTradingBaseFee: number;
  totalTradingQuoteFee: number;
  partnerQuoteFee: number;
  creatorQuoteFee: number;
  protocolQuoteFee: number;
  baseDecimals: number;
  quoteDecimals: number;
}

export class MeteoraDbc {
  private static _instances: { [name: string]: MeteoraDbc };
  public solana: Solana;
  public config: MeteoraDbcConfig.RootConfig;
  public client: DynamicBondingCurveClient;

  private constructor() {
    this.config = MeteoraDbcConfig.config;
    this.solana = null;
  }

  public static async getInstance(network: string): Promise<MeteoraDbc> {
    if (!MeteoraDbc._instances) {
      MeteoraDbc._instances = {};
    }
    if (!MeteoraDbc._instances[network]) {
      const instance = new MeteoraDbc();
      await instance.init(network);
      MeteoraDbc._instances[network] = instance;
    }
    return MeteoraDbc._instances[network];
  }

  private async init(network: string) {
    this.solana = await Solana.getInstance(network);
    this.client = new DynamicBondingCurveClient(this.solana.connection, 'confirmed');
  }

  /** The partner config launches use, or a clear refusal when none is configured. */
  requireConfigAddress(): PublicKey {
    if (!this.config.configAddress) {
      throw httpErrors.badRequest(
        'No DBC config to launch from: pass configAddress, or set meteora.launch.configAddress in ' +
          'conf/connectors/meteora.yml.',
      );
    }
    try {
      return new PublicKey(this.config.configAddress);
    } catch {
      throw httpErrors.internalServerError(
        `meteora.launch.configAddress '${this.config.configAddress}' is not a valid Solana address`,
      );
    }
  }

  /**
   * DBC `transfer_pool_creator`, built from the IDL without reading the pool:
   * a launch creates the pool earlier in the same transaction, so there is
   * nothing to read yet (the SDK's builder fetches it). The DAMM v1
   * migration-metadata account rides as a remaining account, as the SDK's does.
   */
  async transferPoolCreatorInstruction(args: {
    pool: PublicKey;
    config: PublicKey;
    creator: PublicKey;
    newCreator: PublicKey;
  }): Promise<TransactionInstruction> {
    const program = new Program(
      DynamicBondingCurveIdl as any,
      new AnchorProvider(this.solana.connection, new Wallet(Keypair.generate()), { commitment: 'confirmed' }),
    );
    return program.methods
      .transferPoolCreator()
      .accountsPartial({
        virtualPool: args.pool,
        config: args.config,
        creator: args.creator,
        newCreator: args.newCreator,
        eventAuthority: deriveDbcEventAuthority(),
        program: program.programId,
      })
      .remainingAccounts([
        { pubkey: deriveDammV1MigrationMetadataAddress(args.pool), isSigner: false, isWritable: false },
      ])
      .instruction();
  }

  /** Token info for a mint, tolerating tokens outside Gateway's list (fresh launches). */
  async getTokenInfo(addressOrSymbol: string): Promise<TokenInfo> {
    const token = await this.solana.getToken(addressOrSymbol);
    if (!token) {
      throw httpErrors.badRequest(sanitizeErrorMessage('Token not found: {}', addressOrSymbol));
    }
    return token;
  }

  /** The partner config account, or a 404 naming it. */
  async getPoolConfig(configAddress: PublicKey): Promise<PoolConfig> {
    const config = await this.client.state.getPoolConfig(configAddress);
    if (!config) {
      throw httpErrors.notFound(sanitizeErrorMessage('Meteora DBC config not found: {}', configAddress.toBase58()));
    }
    return config;
  }

  /** The pool PDA a launch of `baseMint` from `configAddress` creates. */
  async derivePoolAddress(configAddress: PublicKey, baseMint: PublicKey): Promise<PublicKey> {
    const config = await this.getPoolConfig(configAddress);
    return deriveDbcPoolAddress(config.quoteMint, baseMint, configAddress);
  }

  /** The virtual pool that trades `baseMint`, with its config. */
  async getPoolByBaseMint(baseMint: PublicKey): Promise<DbcPoolState> {
    const found = await this.client.state.getPoolByBaseMint(baseMint);
    if (!found) {
      throw httpErrors.notFound(
        sanitizeErrorMessage('No Meteora DBC pool exists for base mint: {}', baseMint.toBase58()),
      );
    }
    return this.loadPoolState(found.publicKey, found.account);
  }

  /** The virtual pool at `poolAddress`, with its config. */
  async getPool(poolAddress: PublicKey): Promise<DbcPoolState> {
    const pool = await this.client.state.getPool(poolAddress);
    if (!pool) {
      throw httpErrors.notFound(sanitizeErrorMessage('Meteora DBC pool not found: {}', poolAddress.toBase58()));
    }
    return this.loadPoolState(poolAddress, pool);
  }

  private async loadPoolState(poolAddress: PublicKey, pool: VirtualPool): Promise<DbcPoolState> {
    const configAddress = pool.poolState.config;
    const config = await this.client.state.getPoolConfig(configAddress);
    if (!config) {
      throw httpErrors.internalServerError(
        `Meteora DBC pool ${poolAddress.toBase58()} references config ${configAddress.toBase58()}, which does not exist`,
      );
    }
    return {
      poolAddress,
      pool,
      configAddress,
      config,
      baseMint: pool.poolState.baseMint,
      quoteMint: config.quoteMint,
      tokenProgram: getTokenProgram(config.tokenType),
      baseDecimals: config.tokenDecimal,
      quoteDecimals: (await this.getTokenInfo(config.quoteMint.toBase58())).decimals,
      isMigrated: pool.poolState.isMigrated !== 0,
    };
  }

  /** Spot price in quote per base from the pool's current sqrt price. */
  spotPrice(state: DbcPoolState): number {
    return getPriceFromSqrtPrice(state.pool.poolState.sqrtPrice, state.baseDecimals, state.quoteDecimals).toNumber();
  }

  /** The pool-info view of a pool state. */
  poolInfo(state: DbcPoolState): DbcPoolInfo {
    const ps = state.pool.poolState;
    const quoteReserve = fromRawAmount(ps.quoteReserve, state.quoteDecimals);
    const migrationQuoteThreshold = fromRawAmount(state.config.migrationQuoteThreshold, state.quoteDecimals);
    const migrationProgress = state.isMigrated
      ? 1
      : migrationQuoteThreshold > 0
        ? Math.min(1, quoteReserve / migrationQuoteThreshold)
        : 0;
    return {
      poolAddress: state.poolAddress.toBase58(),
      config: state.configAddress.toBase58(),
      creator: ps.creator.toBase58(),
      baseMint: state.baseMint.toBase58(),
      quoteMint: state.quoteMint.toBase58(),
      tokenProgram: state.tokenProgram.toBase58(),
      isMigrated: state.isMigrated,
      migrationProgress,
      quoteReserve,
      migrationQuoteThreshold,
      price: this.spotPrice(state),
      sqrtPrice: ps.sqrtPrice.toString(),
      totalTradingBaseFee: fromRawAmount(ps.metrics.totalTradingBaseFee, state.baseDecimals),
      totalTradingQuoteFee: fromRawAmount(ps.metrics.totalTradingQuoteFee, state.quoteDecimals),
      partnerQuoteFee: fromRawAmount(ps.partnerQuoteFee, state.quoteDecimals),
      creatorQuoteFee: fromRawAmount(ps.creatorQuoteFee, state.quoteDecimals),
      protocolQuoteFee: fromRawAmount(ps.protocolQuoteFee, state.quoteDecimals),
      baseDecimals: state.baseDecimals,
      quoteDecimals: state.quoteDecimals,
    };
  }
}
