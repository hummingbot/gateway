import { BigNumber } from 'ethers';
import superjson from 'superjson';

superjson.registerCustom<BigNumber, string>(
  {
    isApplicable: (v): v is BigNumber => BigNumber.isBigNumber(v),
    serialize: (v) => v.toString(),
    deserialize: (v) => BigNumber.from(v),
  },
  'ethers.BigNumber',
);
