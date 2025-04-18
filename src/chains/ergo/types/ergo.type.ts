import { ErgoTreeHex, NonMandatoryRegisters } from '@fleet-sdk/common';

export type ErgoNetwork = string | 'mainnet' | 'testnet';

export type BoxType = {
  boxId: string;
  ergoTree: ErgoTreeHex;
  creationHeight: number;
  value: number;
  assets: Array<any>;
  additionalRegisters: NonMandatoryRegisters;
  index?: number;
};
