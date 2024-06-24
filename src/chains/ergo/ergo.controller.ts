import { Ergo } from './ergo';
import {
  AssetsResponse,
  BalanceRequest,
  PoolRequest,
  PoolResponse,
} from './ergo.requests';

export class ErgoController {
  static async pool(ergo: Ergo, req: PoolRequest): Promise<PoolResponse> {
    if (!ergo.ready) {
      await ergo.init();
    }
    return ergo.getPool(req.poolId).getPoolInfo;
  }

  static async balances(chain: Ergo, request: BalanceRequest) {
    if (!chain.ready) {
      await chain.init();
    }
    const utxos = await chain.getAddressUnspentBoxes(request.address);
    const { balance, assets } = chain.getBalance(utxos);

    return {
      balance,
      assets,
    };
  }

  static async getTokens(ergo: Ergo): Promise<AssetsResponse> {
    if (!ergo.ready) {
      await ergo.init();
    }
    return {
      assets: ergo.storedAssetList,
    };
  }
}
