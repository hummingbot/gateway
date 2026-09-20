import { Contract } from '@ethersproject/contracts';
import { CurrencyAmount } from '@uniswap/sdk-core';
import { NonfungiblePositionManager, computePoolAddress } from '@uniswap/v3-sdk';
import { BigNumber } from 'ethers';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { TransactionStatus } from '../../../schemas/chain-schema';
import { CollectFeesResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { Uniswap } from '../uniswap';
import { POSITION_MANAGER_ABI, getUniswapV3NftManagerAddress, getUniswapV3FactoryAddress } from '../uniswap.contracts';
import { formatTokenAmount } from '../uniswap.utils';

// Default gas limit for CLMM collect fees operations
const CLMM_COLLECT_FEES_GAS_LIMIT = 200000;

export async function collectFees(
  network: string,
  walletAddress: string,
  positionAddress: string,
): Promise<CollectFeesResponseType> {
  // Validate essential parameters
  if (!positionAddress) {
    throw httpErrors.badRequest('Missing required parameters');
  }

  // Get Uniswap and Ethereum instances
  const uniswap = await Uniswap.getInstance(network);
  const ethereum = await Ethereum.getInstance(network);

  // Get the wallet
  const wallet = await ethereum.getWallet(walletAddress);
  if (!wallet) {
    throw httpErrors.badRequest('Wallet not found');
  }

  // Get position manager address
  const positionManagerAddress = getUniswapV3NftManagerAddress(network);

  // Check NFT ownership
  try {
    await uniswap.checkNFTOwnership(positionAddress, walletAddress);
  } catch (error: any) {
    if (error.message.includes('is not owned by')) {
      throw httpErrors.forbidden(error.message);
    }
    throw httpErrors.badRequest(error.message);
  }

  // Create position manager contract for reading position data
  const positionManager = new Contract(positionManagerAddress, POSITION_MANAGER_ABI, ethereum.provider);

  // Get position details
  const position = await positionManager.positions(positionAddress);

  // Get tokens by address
  const token0 = await uniswap.getToken(position.token0);
  const token1 = await uniswap.getToken(position.token1);

  // The pool this position belongs to, derived from the same inputs position-info
  // uses. The unified route is position-addressed and never receives a pool, so
  // deriving it here is what lets the response name the venue it acted on.
  const poolAddress = computePoolAddress({
    factoryAddress: getUniswapV3FactoryAddress(network),
    tokenA: token0,
    tokenB: token1,
    fee: position.fee,
  });

  // Determine base and quote tokens - WETH or lower address is base
  const isBaseToken0 =
    token0.symbol === 'WETH' ||
    (token1.symbol !== 'WETH' && token0.address.toLowerCase() < token1.address.toLowerCase());

  // Get fees owned
  const feeAmount0 = position.tokensOwed0;
  const feeAmount1 = position.tokensOwed1;

  // If no fees to collect, throw an error
  if (feeAmount0.eq(0) && feeAmount1.eq(0)) {
    throw httpErrors.badRequest('No fees to collect');
  }

  // Create CurrencyAmount objects for fees
  const expectedCurrencyOwed0 = CurrencyAmount.fromRawAmount(token0, feeAmount0.toString());
  const expectedCurrencyOwed1 = CurrencyAmount.fromRawAmount(token1, feeAmount1.toString());

  // Create parameters for collecting fees
  const collectParams = {
    tokenId: positionAddress,
    expectedCurrencyOwed0,
    expectedCurrencyOwed1,
    recipient: walletAddress,
  };

  // Get calldata for collecting fees
  const { calldata, value } = NonfungiblePositionManager.collectCallParameters(collectParams);

  // Initialize position manager with multicall interface
  const positionManagerWithSigner = new Contract(
    positionManagerAddress,
    [
      {
        inputs: [{ internalType: 'bytes[]', name: 'data', type: 'bytes[]' }],
        name: 'multicall',
        outputs: [{ internalType: 'bytes[]', name: 'results', type: 'bytes[]' }],
        stateMutability: 'payable',
        type: 'function',
      },
    ],
    wallet,
  );

  // Execute the transaction to collect fees
  const txParams = await ethereum.prepareGasOptions(undefined, CLMM_COLLECT_FEES_GAS_LIMIT);
  txParams.value = BigNumber.from(value.toString());

  const tx = await positionManagerWithSigner.multicall([calldata], txParams);

  // Wait for transaction confirmation
  const outcome = await ethereum.handleTransactionConfirmation(tx);
  if (!outcome.confirmed) {
    // Still pending — the fee amounts below were read before sending and have not moved.
    return { signature: outcome.signature, status: TransactionStatus.PENDING };
  }

  // Calculate fee amounts collected
  const token0FeeAmount = formatTokenAmount(feeAmount0.toString(), token0.decimals);
  const token1FeeAmount = formatTokenAmount(feeAmount1.toString(), token1.decimals);

  // Map back to base and quote amounts
  const baseFeeAmountCollected = isBaseToken0 ? token0FeeAmount : token1FeeAmount;
  const quoteFeeAmountCollected = isBaseToken0 ? token1FeeAmount : token0FeeAmount;

  return {
    signature: outcome.signature,
    status: TransactionStatus.CONFIRMED,
    data: {
      poolAddress,
      fee: outcome.fee,
      baseFeeAmountCollected,
      quoteFeeAmountCollected,
    },
  };
}
