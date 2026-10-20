import {
  PUMP_SDK,
  PumpSdk,
  GLOBAL_PDA,
  PUMP_FEE_CONFIG_PDA,
  bondingCurvePda,
  canonicalPumpPoolPdaWithQuote,
  isLegacyQuoteMint,
  Global,
  BondingCurve,
  FeeConfig as PumpFeeConfig,
} from '@pump-fun/pump-sdk';
import {
  PUMP_AMM_SDK,
  PumpAmmSdk,
  OnlinePumpAmmSdk,
  SwapSolanaState,
  LiquiditySolanaState,
} from '@pump-fun/pump-swap-sdk';
import { NATIVE_MINT } from '@solana/spl-token';
import { TokenInfo } from '@solana/spl-token-registry';
import { AccountInfo, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

import { Solana } from '../../chains/solana/solana';
import { PoolInfo as AmmPoolInfo } from '../../schemas/amm-schema';
import { httpErrors } from '../../services/error-handler';
import { sanitizeErrorMessage } from '../../services/sanitize';

import { PumpConfig } from './pump.config';
import { fromRawAmount, pumpSwapTotalFeeBps } from './pump.utils';

/** Everything a bonding-curve quote or trade needs, fetched in one RPC call. */
export interface CurveState {
  global: Global;
  feeConfig: PumpFeeConfig | null;
  bondingCurveAccountInfo: AccountInfo<Buffer>;
  bondingCurve: BondingCurve;
  /** Owner of the mint account: legacy curves are SPL Token, v2 curves are Token-2022. */
  tokenProgram: PublicKey;
  /** The curve's quote currency, with legacy SOL curves resolved to the WSOL mint. */
  quoteMint: PublicKey;
  /** True once the curve completed (or migrated): trades belong on the PumpSwap pool. */
  graduated: boolean;
}

export class Pump {
  private static _instances: { [name: string]: Pump };
  public solana: Solana;
  public config: PumpConfig.RootConfig;
  /** Offline instruction builders — no connection, no signing. */
  public readonly sdk: PumpSdk = PUMP_SDK;
  public readonly ammSdk: PumpAmmSdk = PUMP_AMM_SDK;
  /** State fetchers for the PumpSwap AMM, bound to this network's connection. */
  public onlineAmm: OnlinePumpAmmSdk;

  private constructor() {
    this.config = PumpConfig.config;
    this.solana = null;
  }

  public static async getInstance(network: string): Promise<Pump> {
    if (!Pump._instances) {
      Pump._instances = {};
    }
    if (!Pump._instances[network]) {
      const instance = new Pump();
      await instance.init(network);
      Pump._instances[network] = instance;
    }
    return Pump._instances[network];
  }

  private async init(network: string) {
    this.solana = await Solana.getInstance(network);
    this.onlineAmm = new OnlinePumpAmmSdk(this.solana.connection);
  }

  /**
   * Fetch and decode everything a bonding-curve operation needs in one
   * getMultipleAccountsInfo: the pump Global, the fee program's FeeConfig
   * (null when not deployed — fees then fall back to Global's flat bps),
   * the token's bonding curve, and the mint (for its token program).
   */
  async getCurveState(mint: PublicKey): Promise<CurveState> {
    const [globalAccountInfo, feeConfigAccountInfo, bondingCurveAccountInfo, mintAccountInfo] =
      await this.solana.connection.getMultipleAccountsInfo([
        GLOBAL_PDA,
        PUMP_FEE_CONFIG_PDA,
        bondingCurvePda(mint),
        mint,
      ]);

    if (!globalAccountInfo) {
      throw httpErrors.internalServerError('pump global account not found on this network');
    }
    if (!mintAccountInfo) {
      throw httpErrors.notFound(sanitizeErrorMessage('Token mint not found: {}', mint.toBase58()));
    }
    if (!bondingCurveAccountInfo) {
      throw httpErrors.notFound(
        sanitizeErrorMessage('No pump.fun bonding curve exists for token: {}', mint.toBase58()),
      );
    }

    const global = this.sdk.decodeGlobal(globalAccountInfo);
    const feeConfig = feeConfigAccountInfo ? this.sdk.decodeFeeConfig(feeConfigAccountInfo) : null;
    // Nullable decoder: legacy curve accounts predate the layout's newer fields
    // (creator, mayhem, cashback, quoteMint) and are shorter — it zero-pads them,
    // which matches the program's own treatment of the missing fields.
    const bondingCurve = this.sdk.decodeBondingCurveNullable(bondingCurveAccountInfo);
    if (!bondingCurve) {
      throw httpErrors.internalServerError(
        sanitizeErrorMessage('Failed to decode the bonding curve for token: {}', mint.toBase58()),
      );
    }

    return {
      global,
      feeConfig,
      bondingCurveAccountInfo,
      bondingCurve,
      tokenProgram: mintAccountInfo.owner,
      quoteMint: isLegacyQuoteMint(bondingCurve.quoteMint) ? NATIVE_MINT : bondingCurve.quoteMint,
      graduated: bondingCurve.complete || bondingCurve.virtualTokenReserves.isZero(),
    };
  }

  /** The canonical PumpSwap pool a graduated token trades on. */
  canonicalPoolAddress(mint: PublicKey, quoteMint: PublicKey): PublicKey {
    return canonicalPumpPoolPdaWithQuote(mint, quoteMint);
  }

  /**
   * Fetch a PumpSwap pool's swap state, mapping the SDK's "account not found"
   * errors to a 404. The `user` only shapes which ATAs the state derives, so
   * read-only callers pass any address.
   */
  async getSwapState(poolAddress: PublicKey, user: PublicKey): Promise<SwapSolanaState> {
    try {
      return await this.onlineAmm.swapSolanaState(poolAddress, user);
    } catch (e: any) {
      if (String(e?.message).includes('not found')) {
        throw httpErrors.notFound(sanitizeErrorMessage('PumpSwap pool not found: {}', poolAddress.toBase58()));
      }
      throw e;
    }
  }

  /**
   * Fetch a PumpSwap pool's liquidity state, mapping the SDK's "account not
   * found" errors to a 404. Read-only callers pass no user.
   */
  async getLiquidityState(poolAddress: string, user: PublicKey = PublicKey.default): Promise<LiquiditySolanaState> {
    let poolKey: PublicKey;
    try {
      poolKey = new PublicKey(poolAddress);
    } catch {
      throw httpErrors.badRequest(sanitizeErrorMessage('Invalid pool address: {}', poolAddress));
    }
    try {
      return await this.onlineAmm.liquiditySolanaState(poolKey, user);
    } catch (e: any) {
      if (String(e?.message).includes('not found')) {
        throw httpErrors.notFound(sanitizeErrorMessage('PumpSwap pool not found: {}', poolAddress));
      }
      throw e;
    }
  }

  /** Token info for a mint, tolerating tokens outside Gateway's list (fresh pump launches). */
  async getTokenInfo(addressOrSymbol: string): Promise<TokenInfo> {
    const token = await this.solana.getToken(addressOrSymbol);
    if (!token) {
      throw httpErrors.badRequest(sanitizeErrorMessage('Token not found: {}', addressOrSymbol));
    }
    return token;
  }

  /** Standard AMM pool-info shape for a PumpSwap pool. */
  async getAmmPoolInfo(poolAddress: string): Promise<AmmPoolInfo> {
    let poolKey: PublicKey;
    try {
      poolKey = new PublicKey(poolAddress);
    } catch {
      throw httpErrors.badRequest(sanitizeErrorMessage('Invalid pool address: {}', poolAddress));
    }

    const state = await this.getSwapState(poolKey, PublicKey.default);
    const baseDecimals = state.baseMintAccount.decimals;
    const quoteToken = await this.getTokenInfo(state.pool.quoteMint.toBase58());

    const feeBps = pumpSwapTotalFeeBps({
      globalConfig: state.globalConfig,
      feeConfig: state.feeConfig,
      pool: state.pool,
      baseReserve: state.poolBaseAmount,
      quoteReserve: state.poolQuoteAmount.add(state.pool.virtualQuoteReserves ?? new BN(0)),
      baseMintSupply: new BN(state.baseMintAccount.supply.toString()),
    });

    const baseTokenAmount = fromRawAmount(state.poolBaseAmount, baseDecimals);
    const quoteTokenAmount = fromRawAmount(state.poolQuoteAmount, quoteToken.decimals);
    // Newer pools carry virtual quote reserves that participate in pricing, so the
    // price uses the effective reserve while the amounts report what the vaults hold.
    const effectiveQuote = fromRawAmount(
      state.poolQuoteAmount.add(state.pool.virtualQuoteReserves ?? new BN(0)),
      quoteToken.decimals,
    );

    return {
      address: poolAddress,
      baseTokenAddress: state.pool.baseMint.toBase58(),
      quoteTokenAddress: state.pool.quoteMint.toBase58(),
      feePct: feeBps / 100,
      price: baseTokenAmount > 0 ? effectiveQuote / baseTokenAmount : 0,
      baseTokenAmount,
      quoteTokenAmount,
    };
  }
}
