import { Contract } from '@ethersproject/contracts';
import { BigNumber } from 'ethers';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { PositionInfo } from '../../../schemas/amm-schema';
import { httpErrors } from '../../../services/error-handler';
import { Uniswap } from '../uniswap';
import { IUniswapV2PairABI } from '../uniswap.contracts';
import { formatTokenAmount } from '../uniswap.utils';

/**
 * Standard AMM position-info entry point (network-based) — consumed by the unified /trading/amm
 * dispatcher. V2 positions are fungible LP tokens; base/quote follow the pair's token0/token1.
 */
export async function getPositionInfo(
  network: string,
  poolAddress: string,
  walletAddress: string,
): Promise<PositionInfo> {
  if (!poolAddress) throw httpErrors.badRequest('Pool address is required');

  const uniswap = await Uniswap.getInstance(network);
  const ethereum = await Ethereum.getInstance(network);

  const pairContract = new Contract(poolAddress, IUniswapV2PairABI.abi, ethereum.provider);
  const lpBalance = await pairContract.balanceOf(walletAddress);
  const [token0, token1] = await Promise.all([pairContract.token0(), pairContract.token1()]);

  const baseTokenObj = await uniswap.getToken(token0);
  const quoteTokenObj = await uniswap.getToken(token1);
  if (!baseTokenObj || !quoteTokenObj) {
    throw httpErrors.badRequest('Token information not found for pool');
  }

  if (lpBalance.isZero()) {
    return {
      poolAddress,
      walletAddress,
      baseTokenAddress: baseTokenObj.address,
      quoteTokenAddress: quoteTokenObj.address,
      lpTokenAmount: 0,
      baseTokenAmount: 0,
      quoteTokenAmount: 0,
      price: 0,
    };
  }

  const [totalSupply, reserves] = await Promise.all([pairContract.totalSupply(), pairContract.getReserves()]);
  const token0IsBase = token0.toLowerCase() === baseTokenObj.address.toLowerCase();
  const baseTokenReserve = token0IsBase ? reserves[0] : reserves[1];
  const quoteTokenReserve = token0IsBase ? reserves[1] : reserves[0];

  const userBaseTokenAmount = baseTokenReserve.mul(lpBalance).div(totalSupply);
  const userQuoteTokenAmount = quoteTokenReserve.mul(lpBalance).div(totalSupply);

  const baseTokenAmountFloat = formatTokenAmount(baseTokenReserve.toString(), baseTokenObj.decimals);
  const quoteTokenAmountFloat = formatTokenAmount(quoteTokenReserve.toString(), quoteTokenObj.decimals);
  const price = baseTokenAmountFloat > 0 ? quoteTokenAmountFloat / baseTokenAmountFloat : 0;

  return {
    poolAddress,
    walletAddress,
    baseTokenAddress: baseTokenObj.address,
    quoteTokenAddress: quoteTokenObj.address,
    lpTokenAmount: formatTokenAmount(lpBalance.toString(), 18),
    baseTokenAmount: formatTokenAmount(userBaseTokenAmount.toString(), baseTokenObj.decimals),
    quoteTokenAmount: formatTokenAmount(userQuoteTokenAmount.toString(), quoteTokenObj.decimals),
    price,
  };
}

export async function checkLPAllowance(
  ethereum: any,
  wallet: any,
  poolAddress: string,
  routerAddress: string,
  requiredAmount: BigNumber,
): Promise<void> {
  const lpTokenContract = ethereum.getContract(poolAddress, wallet);
  const lpAllowance = await ethereum.getERC20Allowance(
    lpTokenContract,
    wallet,
    routerAddress,
    18, // LP tokens typically have 18 decimals
  );
  const currentLpAllowance = BigNumber.from(lpAllowance.value);
  if (currentLpAllowance.lt(requiredAmount)) {
    throw new Error(
      `Insufficient LP token allowance. Please approve at least ${formatTokenAmount(requiredAmount.toString(), 18)} LP tokens (${poolAddress}) for the Uniswap router (${routerAddress})`,
    );
  }
}
