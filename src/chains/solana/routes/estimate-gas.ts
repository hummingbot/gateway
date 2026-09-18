import { EstimateGasResponse } from '../../../schemas/chain-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Solana } from '../solana';

export async function estimateGasSolana(network: string): Promise<EstimateGasResponse> {
  try {
    const solana = await Solana.getInstance(network);

    const feeResult = await solana.estimateGasPriceDetailed();

    // Get default compute units from config (typically 200000)
    const defaultComputeUnits = solana.config.defaultComputeUnits;

    // Calculate total priority fee in lamports
    const totalPriorityFeeInLamports = feeResult.feePerComputeUnit * defaultComputeUnits;

    // Add base fee (5000 lamports per signature)
    const baseFeeInLamports = 5000;
    const totalFeeInLamports = totalPriorityFeeInLamports + baseFeeInLamports;

    // Convert lamports to SOL (1 SOL = 10^9 lamports)
    const totalFeeInSol = totalFeeInLamports / 1e9;

    return {
      feePerComputeUnit: feeResult.feePerComputeUnit,
      denomination: 'lamports',
      computeUnits: defaultComputeUnits,
      feeAsset: solana.nativeTokenSymbol,
      fee: totalFeeInSol,
      timestamp: Date.now(),
      priorityFeeLevel: feeResult.priorityFeeLevel,
      priorityFeePerCUEstimate: feeResult.priorityFeePerCUEstimate ?? undefined,
    };
  } catch (error) {
    logger.error(`Error estimating gas for network ${network}: ${error.message}`);

    try {
      // If estimation fails but we can still get the instance, return the minPriorityFeePerCU
      const solana = await Solana.getInstance(network);
      const minPriorityFeePerCU = solana.config.minPriorityFeePerCU || 0.1;

      // Get default compute units from config (typically 200000)
      const defaultComputeUnits = solana.config.defaultComputeUnits;

      // Calculate total priority fee in lamports
      const totalPriorityFeeInLamports = minPriorityFeePerCU * defaultComputeUnits;

      // Add base fee (5000 lamports per signature)
      const baseFeeInLamports = 5000;
      const totalFeeInLamports = totalPriorityFeeInLamports + baseFeeInLamports;

      // Convert lamports to SOL (1 SOL = 10^9 lamports)
      const totalFeeInSol = totalFeeInLamports / 1e9;

      return {
        feePerComputeUnit: minPriorityFeePerCU,
        denomination: 'lamports',
        computeUnits: defaultComputeUnits,
        feeAsset: solana.nativeTokenSymbol,
        fee: totalFeeInSol,
        timestamp: Date.now(),
      };
    } catch (instanceError) {
      logger.error(`Error getting Solana instance for network ${network}: ${instanceError.message}`);
      throw httpErrors.internalServerError(
        `Failed to get Solana instance for network ${network}: ${instanceError.message}`,
      );
    }
  }
}
