import { Ergo } from './ergo';

import {
  ErgoUnsignedTransaction,
  OutputBuilder,
  TransactionBuilder,
} from '@fleet-sdk/core';
import {
  AssetsResponse,
  BalanceRequest,
  PollRequest,
  PollResponse,
  PoolRequest,
  PoolResponse,
  TransferRequest,
} from './interfaces/requests.interface';
import { TokensRequest } from '../../network/network.requests';
import { ErgoBoxAsset } from './interfaces/ergo.interface';

export class ErgoController {
  static async pool(ergo: Ergo, req: PoolRequest): Promise<PoolResponse> {
    if (!ergo.ready) {
      await ergo.init();
    }

    return ergo.getPool(req.poolId).info;
  }

  static async poll(ergo: Ergo, req: PollRequest): Promise<PollResponse> {
    if (!ergo.ready) {
      await ergo.init();
    }

    return await ergo.getTx(req.txId);
  }

  static async balances(chain: Ergo, request: BalanceRequest) {
    if (!chain.ready) {
      await chain.init();
    }
    const address = chain.getAccountFromMnemonic(request.privateKey);
    const utxos = await chain.getAddressUnspentBoxes(address.address);
    const { balance, assets } = chain.getBalance(utxos);

    return {
      balance,
      assets,
    };
  }

  static async getTokens(
    ergo: Ergo,
    _req: TokensRequest,
  ): Promise<AssetsResponse> {
    if (!ergo.ready) {
      await ergo.init();
    }

    return {
      assets: ergo.storedAssetList,
    };
  }

  static async transfer(
    ergo: Ergo,
    req: TransferRequest,
  ): Promise<ErgoUnsignedTransaction> {
    const networkHeight = await ergo.getNetworkHeight();
    const utxos = await ergo.getAddressUnspentBoxes(req.fromAddress);

    return new TransactionBuilder(networkHeight)
      .from(
        utxos.map((utxo) => {
          const temp = Object(utxo);
          temp.value = temp.value.toString();
          temp.assets = temp.assets.map((asset: ErgoBoxAsset) => {
            const temp2 = Object(asset);
            temp2.amount = temp2.amount.toString();
            return temp2;
          });
          return temp;
        }),
      )
      .to(
        new OutputBuilder(req.toValue, req.toAddress).addTokens(
          req.assets.map((asset) => {
            const temp = Object(asset);
            temp.amount = temp.amount.toString();
            return temp;
          }),
        ),
      )
      .sendChangeTo(req.fromAddress)
      .payMinFee()
      .build();
  }
}
