import { QuotePositionResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { Orca } from '../orca';
import { OrcaConfig } from '../orca.config';
import { quotePosition as getQuotePosition } from '../orca.utils';

export async function quotePosition(
  network: string,
  lowerPrice: number,
  upperPrice: number,
  poolAddress: string,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  slippagePct: number = OrcaConfig.config.slippagePct ?? 1,
): Promise<QuotePositionResponseType> {
  const orca = await Orca.getInstance(network);

  // Validate price range
  if (lowerPrice >= upperPrice) {
    throw httpErrors.badRequest('lowerPrice must be less than upperPrice');
  }

  if (lowerPrice <= 0 || upperPrice <= 0) {
    throw httpErrors.badRequest('Prices must be positive');
  }

  // If neither amount is specified, return an error
  if (!baseTokenAmount && !quoteTokenAmount) {
    throw httpErrors.badRequest('At least one of baseTokenAmount or quoteTokenAmount must be specified');
  }

  // Get quote from utility method
  const quote = await getQuotePosition(
    orca.solanaKitRpc,
    poolAddress,
    lowerPrice,
    upperPrice,
    baseTokenAmount,
    quoteTokenAmount,
    slippagePct,
  );

  return quote;
}
