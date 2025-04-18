import { WalletProver } from '../../../src/chains/ergo/wallet-prover.service';
import {
  UnsignedTransaction,
  Wallet,
  Transaction,
  ErgoBoxes,
} from 'ergo-lib-wasm-nodejs';
import { NodeService } from '../../../src/chains/ergo/node.service';
import * as ergSDK from '@patternglobal/ergo-sdk';
import { ErgoTx } from '@patternglobal/ergo-sdk';
describe('WalletProver', () => {
  const wallet = new Wallet();
  const nodeService = new NodeService('fake-url', 5000);
  const prover = new WalletProver(wallet, nodeService);
  it('Should be defined', () => {
    expect(WalletProver).toBeDefined();
  });
  it('Should initialize WalletProver with the coorect parameters', () => {
    expect(prover.wallet).toEqual(wallet);
    expect(prover.nodeService).toEqual(nodeService);
  });

  describe('sign', () => {
    const tx = {
      to_js_eip12: jest.fn().mockReturnValue({} as any),
    } as unknown as Transaction;
    beforeEach(() => {
      jest.spyOn(JSON, 'stringify').mockReturnValue({} as any);
      jest.spyOn(nodeService, 'getCtx').mockResolvedValue({} as any);
      jest.spyOn(UnsignedTransaction, 'from_json').mockReturnValue({} as any);
      jest
        .spyOn(ergSDK, 'unsignedErgoTxToProxy')
        .mockReturnValue({ inputs: [{ boxId: '123' }] } as any);
      jest.spyOn(wallet, 'sign_transaction').mockReturnValue(tx);
    });
    it('Should be defined', () => {
      expect(prover.sign).toBeDefined();
    });
    it('Should sign the transaction successfully', async () => {
      jest.spyOn(ErgoBoxes, 'from_boxes_json').mockReturnValue({} as any);
      jest.spyOn(ErgoBoxes, 'empty').mockReturnValue({} as any);
      const result = await prover.sign('tx' as any);
      expect(result).toEqual({});
    });
    it('Should handle the case if signing the transaction fails', async () => {
      jest.spyOn(JSON, 'stringify').mockReturnValue({} as any);
      jest
        .spyOn(wallet, 'sign_transaction')
        .mockReturnValue(new Error('some error') as any);

      await expect(prover.sign('tx' as any)).rejects.toThrow(
        'not be able to sign!',
      );
    });
  });

  describe('submit', () => {
    const tx: ErgoTx = {
      id: 'TxId',
      inputs: [],
      dataInputs: [],
      outputs: [],
      size: 1,
    };
    it('Should be defined', () => {
      expect(prover.submit).toBeDefined();
    });
    it('Should call postTransaction from nodeService and return the correct data', async () => {
      jest
        .spyOn(nodeService, 'postTransaction')
        .mockResolvedValue('returnedTxId');
      jest.spyOn(JSON, 'stringify').mockReturnValue({} as any);
      const result = await prover.submit(tx);
      expect(nodeService.postTransaction).toHaveBeenCalledWith({});
      expect(JSON.stringify).toHaveBeenCalledWith(tx);
      expect(result).toEqual({
        id: 'returnedTxId',
        inputs: [],
        dataInputs: [],
        outputs: [],
        size: 1,
      });
    });
  });

  describe('signInput', () => {
    it('Should be defined', () => {
      expect(prover.signInput).toBeDefined();
    });
    it('Should retrn nothing is called', () => {
      expect(prover.signInput('tx' as any, 'inout' as any)).toEqual(undefined);
    });
  });
});
