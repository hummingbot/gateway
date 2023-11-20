// import { Asset } from '@chain-registry/types';
// import { asset_list, assets } from '@chain-registry/osmosis';
import { calcPoolAprs as _calcPoolAprs } from '@chasevoorhees/osmonauts-math-decimal';

import { CalcPoolAprsParams } from './osmosis.types';

// const osmosisAssets: Asset[] = [
//   ...assets.assets,
//   ...asset_list.assets,
// ];

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
