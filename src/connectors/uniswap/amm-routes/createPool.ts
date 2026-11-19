import { Contract } from '@ethersproject/contracts';
import { Percent } from '@uniswap/sdk-core';
import { Decimal } from 'decimal.js';
import { BigNumber, constants, utils } from 'ethers';

import { Ethereum, TokenInfo } from '../../../chains/ethereum/ethereum';
import { EvmCall } from '../../../chains/ethereum/evm-build-mode';
import { CreatePoolResponseType } from '../../../schemas/amm-schema';
import { TransactionStatus } from '../../../schemas/chain-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { UniswapConfig } from '../uniswap.config';
import {
  IUniswapV2FactoryABI,
  IUniswapV2PairABI,
  IUniswapV2Router02ABI,
  getUniswapV2FactoryAddress,
  getUniswapV2RouterAddress,
} from '../uniswap.contracts';

const V2_FACTORY_CREATE_PAIR_ABI = ['function createPair(address tokenA, address tokenB) returns (address pair)'];

// Default gas limit for AMM create-pool operations (pair creation + initial mint costs more than a plain add).
// Uniswap V2 pools all share a fixed 0.30% swap fee — there is no fee parameter to set.
const AMM_CREATE_POOL_GAS_LIMIT = 600000;

/**
 * Resolves a token symbol or address to its on-chain TokenInfo and flags whether it is the native
 * ETH / WETH side. Native ETH is not an ERC20, so a V2 pair is always WETH-based; when the caller
 * passes 'ETH' we resolve WETH for the pair address and decimals, and the ETH amount is supplied as
 * native value via addLiquidityETH (the router wraps it) — mirroring addLiquidity.ts.
 */
async function resolveToken(ethereum: Ethereum, tokenOrAddress: string): Promise<{ token: TokenInfo; isEth: boolean }> {
  const isEthInput = tokenOrAddress.toUpperCase() === 'ETH';
  const lookup = isEthInput ? 'WETH' : tokenOrAddress;
  const token = await ethereum.getToken(lookup);
  if (!token) {
    throw httpErrors.badRequest(`Token not found: ${tokenOrAddress}`);
  }
  const isEth = isEthInput || token.symbol.toUpperCase() === 'WETH';
  return { token, isEth };
}

/**
 * Fetches the current market price (quote per base) from the unified swap router so a new pool can be
 * seeded on-market instead of at an arbitrary ratio. Seeding off-market invites arbitrage bots to
 * instantly rebalance the pool. Uses a SELL quote of the base token via the network's configured swap
 * provider (an aggregator that does not require this not-yet-created pool); throws a clear error if no
 * market route exists.
 */
async function fetchMarketPrice(
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
): Promise<number> {
  const { getSwapQuote } = await import('../../../trading/market-price');
  let quote: any;
  try {
    quote = await getSwapQuote(`ethereum-${network}`, baseToken, quoteToken, amount, 'SELL');
  } catch (e: any) {
    throw httpErrors.badRequest(
      `Could not fetch a market price for ${baseToken}/${quoteToken} to seed the pool (${e.message}). ` +
        'Pass initialPrice or quoteTokenAmount explicitly.',
    );
  }
  if (!quote || !quote.amountIn || !quote.amountOut) {
    throw httpErrors.badRequest(
      `No market route found for ${baseToken}/${quoteToken}. Pass initialPrice or quoteTokenAmount explicitly.`,
    );
  }
  return quote.amountOut / quote.amountIn; // quote token per base token
}

/** A create-pool decided but not sent: what /build-create-pool returns beside the transaction. */
export interface PreparedCreatePool {
  poolAddress: string;
  seedPrice: number;
  baseTokenAmount: number;
  quoteTokenAmount: number;
  /** The router's allowances the seed deposit needs. */
  allowances: { token: TokenInfo; amount: BigNumber }[];
  routerAddress: string;
  call: EvmCall;
}

/**
 * Everything create-pool decides before sending: the seed price and amounts, the pair's
 * address (known before the pair exists, from an eth_call of the factory's createPair), and
 * the call.
 */
export async function prepareCreatePool(
  network: string,
  walletAddress: string,
  baseToken: string,
  quoteToken: string,
  baseTokenAmount: number,
  quoteTokenAmount?: number,
  initialPrice?: number,
  slippagePct: number = UniswapConfig.config.slippagePct,
): Promise<PreparedCreatePool> {
  if (baseTokenAmount <= 0) {
    throw httpErrors.badRequest('baseTokenAmount must be greater than zero');
  }

  const ethereum = await Ethereum.getInstance(network);

  const { token: baseTokenInfo, isEth: baseIsEth } = await resolveToken(ethereum, baseToken);
  const { token: quoteTokenInfo, isEth: quoteIsEth } = await resolveToken(ethereum, quoteToken);

  if (baseTokenInfo.address.toLowerCase() === quoteTokenInfo.address.toLowerCase()) {
    throw httpErrors.badRequest('baseToken and quoteToken must be different');
  }
  if (baseIsEth && quoteIsEth) {
    throw httpErrors.badRequest('Only one side of the pair can be ETH/WETH');
  }

  // Resolve the seed price (quote per base). Priority:
  //   1) explicit initialPrice
  //   2) explicit quoteTokenAmount (the base:quote ratio sets the price)
  //   3) live market price from the unified swap router — so the pool opens on-market and is not
  //      immediately arbitraged/sniped.
  let seedPrice: number;
  let seedSource: string;
  if (initialPrice !== undefined) {
    if (initialPrice <= 0) throw httpErrors.badRequest('initialPrice must be greater than zero');
    seedPrice = initialPrice;
    seedSource = 'initialPrice';
  } else if (quoteTokenAmount !== undefined) {
    if (quoteTokenAmount <= 0) throw httpErrors.badRequest('quoteTokenAmount must be greater than zero');
    seedPrice = quoteTokenAmount / baseTokenAmount;
    seedSource = 'quoteTokenAmount ratio';
  } else {
    seedPrice = await fetchMarketPrice(network, baseToken, quoteToken, baseTokenAmount);
    seedSource = 'market (unified swap router)';
  }

  const effectiveQuoteAmount = baseTokenAmount * seedPrice;
  logger.info(
    `Seeding Uniswap V2 pool at ${seedPrice} ${quoteTokenInfo.symbol}/${baseTokenInfo.symbol} [${seedSource}]: ` +
      `${baseTokenAmount} ${baseTokenInfo.symbol} + ${effectiveQuoteAmount} ${quoteTokenInfo.symbol}`,
  );

  // Convert desired amounts to raw units. Decimal keeps the quote side within its token decimals.
  const rawBaseAmount = utils.parseUnits(
    new Decimal(baseTokenAmount).toFixed(baseTokenInfo.decimals),
    baseTokenInfo.decimals,
  );
  const rawQuoteAmount = utils.parseUnits(
    new Decimal(effectiveQuoteAmount).toFixed(quoteTokenInfo.decimals),
    quoteTokenInfo.decimals,
  );
  if (rawBaseAmount.isZero() || rawQuoteAmount.isZero()) {
    throw httpErrors.badRequest('Computed token amounts are zero — increase baseTokenAmount');
  }

  // Slippage-adjusted minimums (min amounts accepted into the pair). A brand-new pair has no reserves,
  // so the router mints against exactly the desired amounts, but we still pass minimums to match the
  // add-liquidity semantics and guard against a same-block seed by someone else.
  const slippageTolerance = new Percent(Math.floor(slippagePct * 100), 10000);
  const slippageMultiplier = new Percent(1).subtract(slippageTolerance);
  const rawBaseMinAmount = rawBaseAmount
    .mul(slippageMultiplier.numerator.toString())
    .div(slippageMultiplier.denominator.toString());
  const rawQuoteMinAmount = rawQuoteAmount
    .mul(slippageMultiplier.numerator.toString())
    .div(slippageMultiplier.denominator.toString());

  const factoryAddress = getUniswapV2FactoryAddress(network);
  const routerAddress = getUniswapV2RouterAddress(network);
  const factory = new Contract(factoryAddress, IUniswapV2FactoryABI.abi, ethereum.provider);

  // Create semantics: a V2 pair is a singleton per token pair. The factory may already have deployed
  // the pair contract with ZERO reserves (an empty pair is legal and still needs seeding), so we only
  // reject when the pair already holds reserves — i.e. it is a live pool, not a fresh/empty one.
  const existingPair: string = await factory.getPair(baseTokenInfo.address, quoteTokenInfo.address);
  if (existingPair && existingPair !== constants.AddressZero) {
    const pairContract = new Contract(existingPair, IUniswapV2PairABI.abi, ethereum.provider);
    const reserves = await pairContract.getReserves();
    if (!BigNumber.from(reserves[0]).isZero() || !BigNumber.from(reserves[1]).isZero()) {
      throw new Error(`Pool already exists for this token pair with liquidity: ${existingPair}`);
    }
    logger.info(`Empty V2 pair ${existingPair} already deployed — seeding it with initial liquidity`);
  }
  const poolAddress: string =
    existingPair && existingPair !== constants.AddressZero
      ? existingPair
      : await new Contract(factoryAddress, V2_FACTORY_CREATE_PAIR_ABI, ethereum.provider).callStatic.createPair(
          baseTokenInfo.address,
          quoteTokenInfo.address,
        );

  // addLiquidity auto-creates the pair via the factory if it does not yet exist.
  const router = new utils.Interface(IUniswapV2Router02ABI.abi);
  const allowances: { token: TokenInfo; amount: BigNumber }[] = [];

  const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now

  let data: string;
  let value = '0';
  if (baseIsEth || quoteIsEth) {
    // One side is ETH/WETH → addLiquidityETH. The ERC20 side needs an allowance to the router; the
    // ETH side is supplied as native value (the router wraps it to WETH), matching addLiquidity.ts.
    const ethRawAmount = baseIsEth ? rawBaseAmount : rawQuoteAmount;
    const ethRawMinAmount = baseIsEth ? rawBaseMinAmount : rawQuoteMinAmount;

    const erc20TokenInfo = baseIsEth ? quoteTokenInfo : baseTokenInfo;
    const erc20RawAmount = baseIsEth ? rawQuoteAmount : rawBaseAmount;
    const erc20RawMinAmount = baseIsEth ? rawQuoteMinAmount : rawBaseMinAmount;

    allowances.push({ token: erc20TokenInfo, amount: erc20RawAmount });
    data = router.encodeFunctionData('addLiquidityETH', [
      erc20TokenInfo.address,
      erc20RawAmount,
      erc20RawMinAmount,
      ethRawMinAmount,
      walletAddress,
      deadline,
    ]);
    value = ethRawAmount.toString();
  } else {
    // Both sides are ERC20 → addLiquidity. Both need an allowance to the router.
    allowances.push({ token: baseTokenInfo, amount: rawBaseAmount }, { token: quoteTokenInfo, amount: rawQuoteAmount });
    data = router.encodeFunctionData('addLiquidity', [
      baseTokenInfo.address,
      quoteTokenInfo.address,
      rawBaseAmount,
      rawQuoteAmount,
      rawBaseMinAmount,
      rawQuoteMinAmount,
      walletAddress,
      deadline,
    ]);
  }

  const call: EvmCall = {
    to: routerAddress,
    data,
    value,
    gasLimit: AMM_CREATE_POOL_GAS_LIMIT,
    description: `create Uniswap V2 pool ${baseTokenInfo.symbol}/${quoteTokenInfo.symbol}`,
  };

  return {
    poolAddress,
    seedPrice,
    baseTokenAmount,
    quoteTokenAmount: effectiveQuoteAmount,
    allowances,
    routerAddress,
    call,
  };
}

/** Send a prepared create-pool and report it. */
export async function createPoolFromPrepared(
  network: string,
  walletAddress: string,
  prepared: PreparedCreatePool,
): Promise<CreatePoolResponseType> {
  const ethereum = await Ethereum.getInstance(network);
  const { poolAddress, seedPrice, baseTokenAmount } = prepared;
  const effectiveQuoteAmount = prepared.quoteTokenAmount;
  for (const { token, amount } of prepared.allowances) {
    await ethereum.requireAllowance(walletAddress, token, prepared.routerAddress, amount, 'uniswap/amm');
  }
  const tx = await ethereum.sendTransactionForWallet(walletAddress, prepared.call);

  logger.info(`Creating Uniswap V2 pool ${poolAddress} via tx ${tx.hash}`);

  // A revert throws out of here (400 TRANSACTION_FAILED) — it is never reported as PENDING.
  const outcome = await ethereum.handleTransactionConfirmation(tx);

  if (!outcome.confirmed) {
    // Timed out but still broadcasting — report PENDING with the tx hash so the caller can
    // reconcile it. The seed amounts below have not moved, so they are deliberately omitted.
    return {
      signature: outcome.signature,
      status: TransactionStatus.PENDING,
      poolAddress,
      price: seedPrice,
    };
  }

  return {
    signature: outcome.signature,
    status: TransactionStatus.CONFIRMED,
    poolAddress,
    price: seedPrice,
    data: {
      fee: outcome.fee,
      baseTokenAmountAdded: baseTokenAmount,
      quoteTokenAmountAdded: effectiveQuoteAmount,
    },
  };
}

export async function createPool(
  network: string,
  walletAddress: string,
  baseToken: string,
  quoteToken: string,
  baseTokenAmount: number,
  quoteTokenAmount?: number,
  initialPrice?: number,
  slippagePct: number = UniswapConfig.config.slippagePct,
): Promise<CreatePoolResponseType> {
  const prepared = await prepareCreatePool(
    network,
    walletAddress,
    baseToken,
    quoteToken,
    baseTokenAmount,
    quoteTokenAmount,
    initialPrice,
    slippagePct,
  );
  return createPoolFromPrepared(network, walletAddress, prepared);
}
