import { calcPoolAprs as _calcPoolAprs } from '@osmonauts/math';

import { CalcPoolAprsParams } from './osmosis.types';

// need to pass this tokenList from osmosis.ts...
export const calcPoolAprs = ({
  activeGauges,
  pool,
  prices,
  superfluidPools,
  aprSuperfluid,
  lockupDurations,
  volume7d,
  swapFee,
  lockup = '14',
  includeNonPerpetual = true,
}: CalcPoolAprsParams) => {
  return _calcPoolAprs({
    activeGauges,
    pool,
    assets: [],
    prices,
    superfluidPools,
    aprSuperfluid,
    lockupDurations,
    volume7d,
    swapFee,
    lockup,
    includeNonPerpetual,
  });
};
