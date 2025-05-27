import { Ergo } from './ergo';

import {
  ErgoUnsignedTransaction,
  OutputBuilder,
  TransactionBuilder,
} from '@fleet-sdk/core';
import {
  AssetsResponse,
  PollResponse,
  PoolRequest,
  PoolResponse,
  TransferRequest,
} from './interfaces/requests.interface';
import {
  BalanceRequest,
  BalanceResponse,
  NonceRequest,
  NonceResponse,
  PollRequest,
  StatusRequest,
  StatusResponse,
  TokensRequest,
} from '../chain.requests';
import { ErgoBoxAsset } from './interfaces/ergo.interface';
import { AllowancesRequest, AllowancesResponse } from '../chain.requests';
import { EstimateGasRequestType } from '../../schemas/chain-schema';
import { EstimateGasResponse } from '../../connectors/connector.requests';
import { getErgoConfig } from './ergo.config';

export class ErgoController {
  static async pool(ergo: Ergo, req: PoolRequest): Promise<PoolResponse> {
    if (!ergo.ready()) {
      await ergo.init();
    }

    return ergo.getPool(req.poolId).info;
  }

  static async poll(ergo: Ergo, req: PollRequest): Promise<PollResponse> {
    if (!ergo.ready()) {
      await ergo.init();
    }
    const tx = await ergo.getTx(req.txHash);
    if (!tx)
      return {
        ergo_tx_full: null,
        id: '',
        inputs: [],
        dataInputs: [],
        outputs: [],
        size: 0,
        network: '',
        timestamp: 0,
        currentBlock: 0,
        txHash: '',
        txStatus: -1,
        txBlock: 0,
        txData: null,
        txReceipt: null,
        tokenId: 0,
        fee: 0,
      };
    tx.fee = 0;
    return {
      ...tx,
      ergo_tx_full: tx,
      currentBlock: Number(tx?.inclusionHeight),
      txBlock: Number(tx?.inclusionHeight),
      txHash: tx?.id,
      network: '',
      timestamp: 0,
      txStatus: 1,
      txData: null,
      txReceipt: null,
      fee: 0,
    };
  }

  static async balances(
    chain: Ergo,
    request: BalanceRequest,
  ): Promise<BalanceResponse> {
    if (!chain.ready()) {
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
    if (!ergo.ready()) {
      await ergo.init();
    }

    return {
      tokens: ergo.storedAssetList,
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

  static async getStatus(
    ergo: Ergo,
    req: StatusRequest,
  ): Promise<StatusResponse> {
    return {
      chain: 'ergo',
      network: req.network,
      rpcUrl: ergo.getExplorerUrl(),
      nativeCurrency: 'ERG',
      currentBlockNumber: await ergo.getNetworkHeight(),
    };
  }

  static async allowances(
    chain: Ergo,
    request: AllowancesRequest,
  ): Promise<AllowancesResponse | string> {
    if (!chain.ready()) {
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

  static async nonce(
    ergo: Ergo,
    _request: NonceRequest,
  ): Promise<NonceResponse | void> {
    return {
      nonce: (await ergo.getCurrentEpoch()).height,
    };
  }

  static async gas_cost(
    ergo: Ergo,
    _request: EstimateGasRequestType,
  ): Promise<EstimateGasResponse | null> {
    let ergo_config = getErgoConfig(_request.network);

    return {
      network: _request.network,
      timestamp: await ergo.getCurrentBlockTimestamp(),
      gasPrice: ergo.calculateGas(ergo_config.network.minTxFee),
      gasPriceToken: 'ERG',
      gasLimit: 0,
      gasCost: ergo.calculateGas(ergo_config.network.minTxFee).toString(),
    };
  }
}
