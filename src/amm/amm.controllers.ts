import {
  EstimateGasResponse,
  PerpAvailablePairsResponse,
  PerpCreateTakerRequest,
  PerpCreateTakerResponse,
  PerpMarketRequest,
  PerpMarketResponse,
  PerpPositionRequest,
  PerpPositionResponse,
  PerpPricesResponse,
  PriceRequest,
  PriceResponse,
  TradeRequest,
  TradeResponse,
  AddLiquidityRequest,
  AddLiquidityResponse,
  RemoveLiquidityRequest,
  RemoveLiquidityResponse,
  CollectEarnedFeesRequest,
  PositionRequest,
  PositionResponse,
  PoolPriceRequest,
  PoolPriceResponse,
  PerpBalanceRequest,
  PerpBalanceResponse,
} from './amm.requests';
import {
  price as uniswapPrice,
  trade as uniswapTrade,
  addLiquidity as uniswapV3AddLiquidity,
  removeLiquidity as uniswapV3RemoveLiquidity,
  collectEarnedFees as uniswapV3CollectEarnedFees,
  positionInfo as uniswapV3PositionInfo,
  poolPrice as uniswapV3PoolPrice,
  estimateGas as uniswapEstimateGas,
} from '../connectors/uniswap/uniswap.controllers';
import {
  price as carbonPrice,
  trade as carbonTrade,
  estimateGas as carbonEstimateGas,
} from '../connectors/carbon/carbon.controllers';
import {
  price as refPrice,
  trade as refTrade,
  estimateGas as refEstimateGas,
} from '../connectors/ref/ref.controllers';
import {
  price as tinymanPrice,
  trade as tinymanTrade,
  estimateGas as tinymanEstimateGas,
} from '../connectors/tinyman/tinyman.controllers';
import {
  getPriceData as perpPriceData,
  createTakerOrder as perpCreateTakerOrder,
  estimateGas as perpEstimateGas,
  getPosition as perpGetPosition,
  getAvailablePairs as perpGetAvailablePairs,
  checkMarketStatus as perpCheckMarketStatus,
  getAccountValue as perpGetAccountValue,
} from '../connectors/perp/perp.controllers';
import {
  getPriceData as synfuturesPriceData,
  createTakerOrder as synfuturesCreateTakerOrder,
  estimateGas as synfuturesEstimateGas,
  getPosition as synfuturesGetPosition,
  getAvailablePairs as synfuturesGetAvailablePairs,
  checkMarketStatus as synfuturesCheckMarketStatus,
  getAccountValue as synfuturesGetAccountValue,
} from '../connectors/synfutures/synfutures.controllers';
import {
  price as plentyPrice,
  trade as plentyTrade,
  estimateGas as plentyEstimateGas,
} from '../connectors/plenty/plenty.controllers';
import {
  price as quipuPrice,
  trade as quipuTrade,
  estimateGas as quipuEstimateGas,
} from '../connectors/quipuswap/quipuswap.controllers';
import {
  getInitializedChain,
  getConnector,
} from '../services/connection-manager';
import {
  Chain as Ethereumish,
  Nearish,
  NetworkSelectionRequest,
  Perpish,
  RefAMMish,
  SynFuturesish,
  Tezosish,
  Uniswapish,
  UniswapLPish,
} from '../services/common-interfaces';
import { Algorand } from '../chains/algorand/algorand';
import { Tinyman } from '../connectors/tinyman/tinyman';
import { Plenty } from '../connectors/plenty/plenty';
import { QuipuSwap } from '../connectors/quipuswap/quipuswap';
import { Osmosis } from '../chains/osmosis/osmosis';
import { Carbonamm } from '../connectors/carbon/carbonAMM';
import { Perp } from '../connectors/perp/perp';

export async function price(req: PriceRequest): Promise<PriceResponse> {
  const chain = await getInitializedChain<
    Algorand | Ethereumish | Nearish | Tezosish | Osmosis
  >(req.chain, req.network);
  if (chain instanceof Osmosis){
    return chain.controller.price(chain as unknown as Osmosis, req);
  }

  const connector: Uniswapish | RefAMMish | Tinyman | Plenty | QuipuSwap =
    await getConnector<Uniswapish | RefAMMish | Tinyman | Plenty | QuipuSwap>(
      req.chain,
      req.network,
      req.connector
    );

  if (connector instanceof Plenty) {
    return plentyPrice(<Tezosish>chain, connector, req);
  } else if (connector instanceof QuipuSwap) {
    return quipuPrice(<Tezosish>chain, connector, req);
  } else if (connector instanceof Carbonamm) {
    return carbonPrice(<Ethereumish>chain, connector, req);
  } else if ('routerAbi' in connector) {
    // we currently use the presence of routerAbi to distinguish Uniswapish from RefAMMish
    return uniswapPrice(<Ethereumish>chain, connector, req);
  } else if (connector instanceof Tinyman) {
    return tinymanPrice(chain as unknown as Algorand, connector, req);
  } else {
    return refPrice(<Nearish>chain, connector as RefAMMish, req);
  }
}

export async function trade(req: TradeRequest): Promise<TradeResponse> {
  const chain = await getInitializedChain<
    Algorand | Ethereumish | Nearish | Tezosish | Osmosis
  >(req.chain, req.network);
  if (chain instanceof Osmosis){
    return chain.controller.trade(chain as unknown as Osmosis, req);
  }

  const connector: Uniswapish | RefAMMish | Tinyman | Plenty | QuipuSwap =
    await getConnector<Uniswapish | RefAMMish | Tinyman | Plenty | QuipuSwap>(
      req.chain,
      req.network,
      req.connector
    );

  if (connector instanceof Plenty) {
    return plentyTrade(<Tezosish>chain, connector, req);
  } else if (connector instanceof QuipuSwap) {
    return quipuTrade(<Tezosish>chain, connector, req);
  } else if (connector instanceof Carbonamm) {
    return carbonTrade(<Ethereumish>chain, connector, req);
  } else if ('routerAbi' in connector) {
    // we currently use the presence of routerAbi to distinguish Uniswapish from RefAMMish
    return uniswapTrade(<Ethereumish>chain, connector, req);
  } else if (connector instanceof Tinyman) {
    return tinymanTrade(chain as unknown as Algorand, connector, req);
  } else {
    return refTrade(<Nearish>chain, connector as RefAMMish, req);
  }
}

export async function addLiquidity(
  req: AddLiquidityRequest
): Promise<AddLiquidityResponse> {
  const chain = await getInitializedChain<Ethereumish | Osmosis>(req.chain, req.network);
  if (chain instanceof Osmosis){
    return chain.controller.addLiquidity(chain as unknown as Osmosis, req);
  }
  const connector: UniswapLPish = await getConnector<UniswapLPish>(
    req.chain,
    req.network,
    req.connector
  );

  return uniswapV3AddLiquidity(chain, connector, req);
}

export async function reduceLiquidity(
  req: RemoveLiquidityRequest
): Promise<RemoveLiquidityResponse> {
  const chain = await getInitializedChain<Ethereumish | Osmosis>(req.chain, req.network);
  if (chain instanceof Osmosis){
    return chain.controller.removeLiquidity(chain as unknown as Osmosis, req);
  }
  const connector: UniswapLPish = await getConnector<UniswapLPish>(
    req.chain,
    req.network,
    req.connector
  );

  return uniswapV3RemoveLiquidity(chain, connector, req);
}

export async function collectFees(
  req: CollectEarnedFeesRequest
): Promise<RemoveLiquidityResponse> {
  const chain = await getInitializedChain<Ethereumish | Osmosis>(req.chain, req.network);
  if (chain instanceof Osmosis){
    return chain.controller.collectFees(chain as unknown as Osmosis, req);
  }
  const connector: UniswapLPish = await getConnector<UniswapLPish>(
    req.chain,
    req.network,
    req.connector
  );
  return uniswapV3CollectEarnedFees(chain, connector, req);
}

export async function positionInfo(
  req: PositionRequest
): Promise<PositionResponse> {
  const chain = await getInitializedChain<Ethereumish | Osmosis>(req.chain, req.network);
  if (chain instanceof Osmosis){
    return chain.controller.poolPositions(chain as unknown as Osmosis, req);
  }
  const connector: UniswapLPish = await getConnector<UniswapLPish>(
    req.chain,
    req.network,
    req.connector
  );
  return uniswapV3PositionInfo(chain, connector, req);
}

export async function poolPrice(
  req: PoolPriceRequest
): Promise<PoolPriceResponse> {
  const chain = await getInitializedChain<Ethereumish | Osmosis>(req.chain, req.network);
  if (chain instanceof Osmosis){
    return chain.controller.poolPrice(chain as unknown as Osmosis, req);
  }
  const connector: UniswapLPish = await getConnector<UniswapLPish>(
    req.chain,
    req.network,
    req.connector
  );
  return uniswapV3PoolPrice(chain, connector, req);
}

export async function estimateGas(
  req: NetworkSelectionRequest
): Promise<EstimateGasResponse> {
  const chain = await getInitializedChain<
    Algorand | Ethereumish | Nearish | Tezosish | Osmosis
  >(req.chain, req.network);
  if (chain instanceof Osmosis){
    return chain.controller.estimateGas(chain as unknown as Osmosis);
  }
  
  const connector: Uniswapish | RefAMMish | Tinyman | Plenty | QuipuSwap =
    await getConnector<Uniswapish | RefAMMish | Plenty | QuipuSwap>(
      req.chain,
      req.network,
      req.connector
    );

  if (connector instanceof Plenty) {
    return plentyEstimateGas(<Tezosish>chain, connector);
  } else if (connector instanceof QuipuSwap) {
    return quipuEstimateGas(<Tezosish>chain, connector);
  } else if (connector instanceof Carbonamm) {
    return carbonEstimateGas(<Ethereumish>chain, connector);
  } else if ('routerAbi' in connector) {
    // we currently use the presence of routerAbi to distinguish Uniswapish from RefAMMish
    return uniswapEstimateGas(<Ethereumish>chain, connector);
  } else if (connector instanceof Tinyman) {
    return tinymanEstimateGas(chain as unknown as Algorand, connector);
  } else {
    return refEstimateGas(<Nearish>chain, connector as RefAMMish);
  }
}

// perp
export async function perpMarketPrices(
  req: PriceRequest
): Promise<PerpPricesResponse> {
  const chain = await getInitializedChain<Ethereumish>(req.chain, req.network);
  const connector: Perpish | SynFuturesish = await getConnector<Perpish | SynFuturesish>(
    req.chain,
    req.network,
    req.connector
  );

  if (connector instanceof Perp) {
    return perpPriceData(chain, <Perpish>connector, req);
  } else {
    return synfuturesPriceData(chain, <SynFuturesish>connector, req);
  }
}

export async function perpOrder(
  req: PerpCreateTakerRequest,
  isOpen: boolean
): Promise<PerpCreateTakerResponse> {
  const chain = await getInitializedChain<Ethereumish>(req.chain, req.network);
  const connector: Perpish | SynFuturesish = await getConnector<Perpish | SynFuturesish>(
    req.chain,
    req.network,
    req.connector,
    req.address
  );

  if (connector instanceof Perp) {
    return perpCreateTakerOrder(chain, <Perpish>connector, req, isOpen);
  } else {
    return synfuturesCreateTakerOrder(chain, <SynFuturesish>connector, req, isOpen);
  }
}

export async function perpPosition(
  req: PerpPositionRequest
): Promise<PerpPositionResponse> {
  const chain = await getInitializedChain<Ethereumish>(req.chain, req.network);
  const connector: Perpish | SynFuturesish = await getConnector<Perpish | SynFuturesish>(
    req.chain,
    req.network,
    req.connector,
    req.address
  );

  if (connector instanceof Perp) {
    return perpGetPosition(chain, <Perpish>connector, req);
  } else {
    return synfuturesGetPosition(chain, <SynFuturesish>connector, req);
  }
}

export async function perpBalance(
  req: PerpBalanceRequest
): Promise<PerpBalanceResponse> {
  const chain = await getInitializedChain(req.chain, req.network);
  const connector: Perpish | SynFuturesish = await getConnector<Perpish | SynFuturesish>(
    req.chain,
    req.network,
    req.connector,
    req.address
  );

  if (connector instanceof Perp) {
    return perpGetAccountValue(chain, <Perpish>connector);
  } else {
    return synfuturesGetAccountValue(chain, <SynFuturesish>connector, req);
  }
}

export async function perpPairs(
  req: NetworkSelectionRequest
): Promise<PerpAvailablePairsResponse> {
  const chain = await getInitializedChain<Ethereumish>(req.chain, req.network);
  const connector: Perpish | SynFuturesish = await getConnector<Perpish | SynFuturesish>(
    req.chain,
    req.network,
    req.connector
  );

  if (connector instanceof Perp) {
    return perpGetAvailablePairs(chain, <Perpish>connector);
  } else {
    return synfuturesGetAvailablePairs(chain, <SynFuturesish>connector);
  }
}

export async function getMarketStatus(
  req: PerpMarketRequest
): Promise<PerpMarketResponse> {
  const chain = await getInitializedChain<Ethereumish>(req.chain, req.network);
  const connector: Perpish | SynFuturesish = await getConnector<Perpish | SynFuturesish>(
    req.chain,
    req.network,
    req.connector
  );

  if (connector instanceof Perp) {
    return perpCheckMarketStatus(chain, <Perpish>connector, req);
  } else {
    return synfuturesCheckMarketStatus(chain, <SynFuturesish>connector, req);
  }
}

export async function estimatePerpGas(
  req: NetworkSelectionRequest
): Promise<EstimateGasResponse> {
  const chain = await getInitializedChain<Ethereumish>(req.chain, req.network);
  const connector: Perpish | SynFuturesish = await getConnector<Perpish | SynFuturesish>(
    req.chain,
    req.network,
    req.connector
  );

  if (connector instanceof Perp) {
    return perpEstimateGas(chain, <Perpish>connector);
  } else {
    return synfuturesEstimateGas(chain, <SynFuturesish>connector);
  }
}
