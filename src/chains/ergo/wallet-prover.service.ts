import { Wallet, ErgoBoxes, UnsignedTransaction } from 'ergo-lib-wasm-nodejs';
import { NodeService } from './node.service';
import {
  Prover,
  ErgoTx,
  UnsignedErgoTx,
  unsignedErgoTxToProxy,
  Input as TxInput,
} from '@patternglobal/ergo-sdk';

export class WalletProver implements Prover {
  readonly wallet: Wallet;
  readonly nodeService: NodeService;

  constructor(wallet: Wallet, nodeService: NodeService) {
    this.wallet = wallet;
    this.nodeService = nodeService;
  }

  /** Sign the given transaction.
   */
  async sign(tx: UnsignedErgoTx): Promise<ErgoTx> {
    const ctx = await this.nodeService.getCtx();
    const proxy = unsignedErgoTxToProxy(tx);
    const wasmtx = UnsignedTransaction.from_json(JSON.stringify(proxy));

    try {
      return this.wallet
        .sign_transaction(
          ctx,
          wasmtx,
          ErgoBoxes.from_boxes_json(proxy.inputs),
          ErgoBoxes.empty(),
        )
        .to_js_eip12();
    } catch {
      throw new Error('not be able to sign!');
    }
  }

  async submit(tx: ErgoTx): Promise<ErgoTx> {
    const txId = await this.nodeService.postTransaction(JSON.stringify(tx));
    return {
      ...tx,
      id: txId,
    };
  }

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  signInput(tx: UnsignedErgoTx, input: number): Promise<TxInput> {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    return;
  }
}
