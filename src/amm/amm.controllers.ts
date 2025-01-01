import {
  EstimateGasResponse,
  PriceRequest,
  PriceResponse,
  TradeRequest,
  TradeResponse,
} from './amm.requests';
import {
  price as uniswapPrice,
  trade as uniswapTrade,
  estimateGas as uniswapEstimateGas,
} from '../connectors/uniswap/uniswap.controllers';
import {
  price as jupiterPrice,
  trade as jupiterTrade,
  estimateGas as jupiterEstimateGas,
} from '../connectors/jupiter/jupiter.controllers';
import {
  getInitializedChain,
  getConnector,
} from '../services/connection-manager';
import {
  Chain as Ethereumish,
  NetworkSelectionRequest,
  Uniswapish,
} from '../services/common-interfaces';
import { Solanaish } from '../chains/solana/solana';
import { Solana } from '../chains/solana/solana';
import { Jupiter } from '../connectors/jupiter/jupiter';

export async function price(req: PriceRequest): Promise<PriceResponse> {
  const chain = await getInitializedChain<
    Ethereumish | Solana
  >(req.chain, req.network);

  const connector: Uniswapish | Jupiter =
    await getConnector<Uniswapish | Jupiter>(
      req.chain,
      req.network,
      req.connector
    );

  if (connector instanceof Jupiter) {
    return jupiterPrice(<Solanaish>chain, connector, req);
  } else return uniswapPrice(<Ethereumish>chain, connector, req);

}

export async function trade(req: TradeRequest): Promise<TradeResponse> {
  const chain = await getInitializedChain<
    Ethereumish | Solana
  >(req.chain, req.network);

  const connector: Uniswapish | Jupiter =
    await getConnector<Uniswapish | Jupiter>(
      req.chain,
      req.network,
      req.connector
    );

  if (connector instanceof Jupiter) {
    return jupiterTrade(<Solanaish>chain, connector, req);
  } else return uniswapTrade(<Ethereumish>chain, connector, req);
}

export async function estimateGas(
  req: NetworkSelectionRequest
): Promise<EstimateGasResponse> {
  const chain = await getInitializedChain<
    Ethereumish | Solana
  >(req.chain, req.network);
  
  const connector: Uniswapish | Jupiter =
    await getConnector<Uniswapish | Jupiter>(
      req.chain,
      req.network,
      req.connector
    );

  if (connector instanceof Jupiter) {
    return jupiterEstimateGas(<Solanaish>chain, connector);
  } else return uniswapEstimateGas(<Ethereumish>chain, connector);
}
