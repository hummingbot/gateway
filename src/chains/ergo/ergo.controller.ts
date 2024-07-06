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
import { BalanceResponse, TokensRequest } from '../../network/network.requests';
import { ErgoBoxAsset } from './interfaces/ergo.interface';
import { AllowancesRequest, AllowancesResponse } from '../chain.requests';

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

  static async balances(
    chain: Ergo,
    request: BalanceRequest,
  ): Promise<BalanceResponse> {
    if (!chain.ready) {
      await chain.init();
    }
    const utxos = await chain.getAddressUnspentBoxes(request.address);
    const { balance, assets } = chain.getBalance(utxos);
    const new_assets: Record<string, string> = {};
    Object.keys(assets).forEach((value) => {
      const temp = chain.storedAssetList.find(
        (asset) => asset.tokenId === value,
      );
      if (temp) {
        new_assets[temp.symbol] = assets[value]
          .div(Math.pow(10, temp.decimals))
          .toString();
      }
    });
    return {
      network: chain.network,
      timestamp: Date.now(),
      latency: 0,
      balances: { ERG: balance.div(Math.pow(10, 9)).toString(), ...new_assets },
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

  static async allowances(
    chain: Ergo,
    request: AllowancesRequest,
  ): Promise<AllowancesResponse | string> {
    if (!chain.ready) {
      await chain.init();
    }
    const utxos = await chain.getAddressUnspentBoxes(request.address);
    const { balance, assets } = chain.getBalance(utxos);
    const new_assets: Record<string, string> = {};
    Object.keys(assets).forEach((value) => {
      const temp = chain.storedAssetList.find(
        (asset) => asset.tokenId === value,
      );
      if (temp) {
        new_assets[temp.symbol] = assets[value]
          .div(Math.pow(10, temp.decimals))
          .toString();
      }
    });
    return {
      network: chain.network,
      timestamp: Date.now(),
      latency: 0,
      spender: request.spender,
      approvals: {
        ERG: balance.div(Math.pow(10, 9)).toString(),
        ...new_assets,
      },
    };
  }
}
