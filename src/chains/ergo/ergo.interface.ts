import {ErgoBoxes, ErgoStateContext, UnsignedTransaction, Wallet} from "ergo-lib-wasm-nodejs";
import {ErgoTreeHex, NonMandatoryRegisters} from "@fleet-sdk/common";
import {AmmPool} from "@ergolabs/ergo-dex-sdk";
import {
  ErgoTx,
  Input as TxInput,
  Prover,
  UnsignedErgoTx,
  unsignedErgoTxToProxy,
  publicKeyFromAddress,
  AssetAmount,
  Explorer,
  DefaultTxAssembler,
  RustModule, TransactionContext
} from '@ergolabs/ergo-sdk';
import {NodeService} from "./node.service";
export interface ErgoAsset {
  tokenId: number;
  decimals: number;
  name: string;
  symbol: string
}

class WalletProver implements Prover {
  /** Sign the given transaction.
   */
  async sign(tx: UnsignedErgoTx, wallet: Wallet, nodeService: NodeService): Promise<ErgoTx> {
    const ctx = await nodeService.getCtx()
    const proxy = unsignedErgoTxToProxy(tx);
    const wasmtx = UnsignedTransaction.from_json(JSON.stringify(proxy))
    try {
      return wallet.sign_transaction(ctx, wasmtx, ErgoBoxes.from_boxes_json(proxy.inputs), ErgoBoxes.empty()).to_js_eip12()
    } catch {
      throw new Error("not be able to sign!")
    }
  }

  async submit(tx: ErgoTx, nodeService: NodeService): Promise<ErgoTx> {
    return await nodeService.postTransaction(tx)
  }
}
export class Pool extends AmmPool{
  private name:string
  constructor(public pool: AmmPool) {
    super(pool.id,pool.lp, pool.x, pool.y, pool.poolFeeNum);
    this.name = `${this.x.asset.name}/${this.y.asset.name}`
  }

  // @ts-ignore
  private getName() {
    return this.name
  }


  // calculatePriceImpact(input: any): number {
  //   const ratio =
  //     input.asset.id === this.x.asset.id
  //       ? math.evaluate!(
  //         `${renderFractions(this.y.amount.valueOf(), this.y.asset.decimals)} / ${renderFractions(this.x.amount.valueOf(), this.x.asset.decimals)}`,
  //       ).toString()
  //       : math.evaluate!(
  //         `${renderFractions(this.x.amount.valueOf(), this.x.asset.decimals)} / ${renderFractions(this.y.amount.valueOf(), this.y.asset.decimals)}`,
  //       ).toString();
  //   const outputAmount = calculatePureOutputAmount(input, this);
  //   const outputRatio = math.evaluate!(
  //     `${outputAmount} / ${renderFractions(input.amount, input.asset.decimals)}`,
  //   ).toString();
  //
  //   return Math.abs(
  //     math.evaluate!(`(${outputRatio} * 100 / ${ratio}) - 100`).toFixed(2),
  //   );
  // }
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