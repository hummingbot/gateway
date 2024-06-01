import {Wallet} from "ergo-lib-wasm-nodejs";
import {ErgoTreeHex, NonMandatoryRegisters} from "@fleet-sdk/common";
export interface ErgoAsset {
  tokenId: number;
  decimals: number;
  name: string;
  symbol: string
}

export interface Account {
  wallet: Wallet;
  address: string;
}



export type BoxType = {
  boxId: string;
  ergoTree: ErgoTreeHex;
  creationHeight: number;
  value: number;
  assets: any[];
  additionalRegisters: NonMandatoryRegisters;
  index?: number
};