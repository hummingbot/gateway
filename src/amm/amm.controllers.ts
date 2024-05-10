import {
  AddLiquidityRequest,
  AddLiquidityResponse,
  CollectEarnedFeesRequest,
  EstimateGasResponse,
  PerpAvailablePairsResponse,
  PerpBalanceRequest,
  PerpBalanceResponse,
  PerpCreateTakerRequest,
  PerpCreateTakerResponse,
  PerpMarketRequest,
  PerpMarketResponse,
  PerpPositionRequest,
  PerpPositionResponse,
  PerpPricesResponse,
  PoolPriceRequest,
  PoolPriceResponse,
  PositionRequest,
  PositionResponse,
  PriceRequest,
  PriceResponse,
  RemoveLiquidityRequest,
  RemoveLiquidityResponse,
  TradeRequest,
  TradeResponse,
} from './amm.requests';
import {
  addLiquidity as uniswapV3AddLiquidity,
  collectEarnedFees as uniswapV3CollectEarnedFees,
  estimateGas as uniswapEstimateGas,
  poolPrice as uniswapV3PoolPrice,
  positionInfo as uniswapV3PositionInfo,
  price as uniswapPrice,
  removeLiquidity as uniswapV3RemoveLiquidity,
  trade as uniswapTrade,
} from '../connectors/uniswap/uniswap.controllers';
import {
  estimateGas as refEstimateGas,
  price as refPrice,
  trade as refTrade,
} from '../connectors/ref/ref.controllers';
import {
  estimateGas as tinymanEstimateGas,
  price as tinymanPrice,
  trade as tinymanTrade,
} from '../connectors/tinyman/tinyman.controllers';
import {
  checkMarketStatus,
  createTakerOrder,
  estimateGas as perpEstimateGas,
  getAccountValue,
  getAvailablePairs,
  getPosition,
  getPriceData as perpPriceData,
} from '../connectors/perp/perp.controllers';
import {
  getConnector,
  getInitializedChain,
} from '../services/connection-manager';
import {
  Ethereumish,
  Nearish,
  NetworkSelectionRequest,
  Perpish,
  RefAMMish,
  Uniswapish,
  UniswapLPish,
  ZigZagish,
} from '../services/common-interfaces';
import {
  price as zigzagPrice,
  trade as zigzagTrade,
} from '../connectors/zigzag/zigzag.controllers';
import { Algorand } from '../chains/algorand/algorand';
import { Tinyman } from '../connectors/tinyman/tinyman';

export async function price(req: PriceRequest): Promise<PriceResponse> {
  const chain = await getInitializedChain<Algorand | Ethereumish | Nearish>(
    req.chain,
    req.network,
  );
  const connector: Uniswapish | RefAMMish | Tinyman | ZigZagish =
    await getConnector<Uniswapish | RefAMMish | Tinyman | ZigZagish>(
      req.chain,
      req.network,
      req.connector,
    );

  // we currently use the presence of routerAbi to distinguish Uniswapish from RefAMMish
  if ('routerAbi' in connector) {
    return uniswapPrice(<Ethereumish>chain, connector, req);
  } else if ('estimate' in connector) {
    return zigzagPrice(<Ethereumish>chain, connector as any, req);
  } else if (connector instanceof Tinyman) {
    return tinymanPrice(chain as unknown as Algorand, connector, req);
  } else {
    return refPrice(<Nearish>chain, connector, req);
  }
}

export async function trade(req: TradeRequest): Promise<TradeResponse> {
  const chain = await getInitializedChain<Algorand | Ethereumish | Nearish>(
    req.chain,
    req.network,
  );
  const connector: Uniswapish | RefAMMish | Tinyman | ZigZagish =
    await getConnector<Uniswapish | RefAMMish | Tinyman | ZigZagish>(
      req.chain,
      req.network,
      req.connector,
    );

  // we currently use the presence of routerAbi to distinguish Uniswapish from RefAMMish
  if ('routerAbi' in connector) {
    return uniswapTrade(<Ethereumish>chain, connector, req);
  } else if ('estimate' in connector) {
    return zigzagTrade(<Ethereumish>chain, connector as any, req);
  } else if (connector instanceof Tinyman) {
    return tinymanTrade(chain as unknown as Algorand, connector, req);
  } else {
    return refTrade(<Nearish>chain, connector, req);
  }
}

export async function addLiquidity(
  req: AddLiquidityRequest,
): Promise<AddLiquidityResponse> {
  const chain = await getInitializedChain<Ethereumish>(req.chain, req.network);
  const connector: UniswapLPish = await getConnector<UniswapLPish>(
    req.chain,
    req.network,
    req.connector,
  );

  return uniswapV3AddLiquidity(chain, connector, req);
}

export async function reduceLiquidity(
  req: RemoveLiquidityRequest,
): Promise<RemoveLiquidityResponse> {
  const chain = await getInitializedChain<Ethereumish>(req.chain, req.network);
  const connector: UniswapLPish = await getConnector<UniswapLPish>(
    req.chain,
    req.network,
    req.connector,
  );

  return uniswapV3RemoveLiquidity(chain, connector, req);
}

export async function collectFees(
  req: CollectEarnedFeesRequest,
): Promise<RemoveLiquidityResponse> {
  const chain = await getInitializedChain<Ethereumish>(req.chain, req.network);
  const connector: UniswapLPish = await getConnector<UniswapLPish>(
    req.chain,
    req.network,
    req.connector,
  );
  return uniswapV3CollectEarnedFees(chain, connector, req);
}

export async function positionInfo(req: PositionRequest): Promise<PositionResponse> {
  const chain = await getInitializedChain<Ethereumish>(req.chain, req.network);
  const connector: UniswapLPish = await getConnector<UniswapLPish>(
    req.chain,
    req.network,
    req.connector,
  );
  return uniswapV3PositionInfo(chain, connector, req);
}

export async function poolPrice(req: PoolPriceRequest): Promise<PoolPriceResponse> {
  const chain = await getInitializedChain<Ethereumish>(req.chain, req.network);
  const connector: UniswapLPish = await getConnector<UniswapLPish>(
    req.chain,
    req.network,
    req.connector,
  );
  return uniswapV3PoolPrice(chain, connector, req);
}

export async function estimateGas(
  req: NetworkSelectionRequest,
): Promise<EstimateGasResponse> {
  const chain = await getInitializedChain<Algorand | Ethereumish | Nearish>(
    req.chain,
    req.network,
  );
  const connector: Uniswapish | RefAMMish | Tinyman = await getConnector<
    Uniswapish | RefAMMish
  >(req.chain, req.network, req.connector);

  // we currently use the presence of routerAbi to distinguish Uniswapish from RefAMMish
  if ('routerAbi' in connector) {
    return uniswapEstimateGas(<Ethereumish>chain, connector);
  } else if (connector instanceof Tinyman) {
    return tinymanEstimateGas(chain as unknown as Algorand, connector);
  } else {
    return refEstimateGas(<Nearish>chain, connector);
  }
}

// perp
export async function perpMarketPrices(
  req: PriceRequest,
): Promise<PerpPricesResponse> {
  const chain = await getInitializedChain<Ethereumish>(req.chain, req.network);
  const connector: Perpish = await getConnector<Perpish>(
    req.chain,
    req.network,
    req.connector,
  );
  return perpPriceData(chain, connector, req);
}

export async function perpOrder(
  req: PerpCreateTakerRequest,
  isOpen: boolean,
): Promise<PerpCreateTakerResponse> {
  const chain = await getInitializedChain<Ethereumish>(req.chain, req.network);
  const connector: Perpish = await getConnector<Perpish>(
    req.chain,
    req.network,
    req.connector,
    req.address,
  );
  return createTakerOrder(chain, connector, req, isOpen);
}

export async function perpPosition(
  req: PerpPositionRequest,
): Promise<PerpPositionResponse> {
  const chain = await getInitializedChain<Ethereumish>(req.chain, req.network);
  const connector: Perpish = await getConnector<Perpish>(
    req.chain,
    req.network,
    req.connector,
    req.address,
  );
  return getPosition(chain, connector, req);
}

export async function perpBalance(
  req: PerpBalanceRequest,
): Promise<PerpBalanceResponse> {
  const chain = await getInitializedChain(req.chain, req.network);
  const connector: Perpish = <Perpish>(
    await getConnector(req.chain, req.network, req.connector, req.address)
  );
  return getAccountValue(chain, connector);
}

export async function perpPairs(
  req: NetworkSelectionRequest,
): Promise<PerpAvailablePairsResponse> {
  const chain = await getInitializedChain<Ethereumish>(req.chain, req.network);
  const connector: Perpish = await getConnector<Perpish>(
    req.chain,
    req.network,
    req.connector,
  );
  return getAvailablePairs(chain, connector);
}

export async function getMarketStatus(
  req: PerpMarketRequest,
): Promise<PerpMarketResponse> {
  const chain = await getInitializedChain<Ethereumish>(req.chain, req.network);
  const connector: Perpish = await getConnector<Perpish>(
    req.chain,
    req.network,
    req.connector,
  );
  return checkMarketStatus(chain, connector, req);
}

export async function estimatePerpGas(
  req: NetworkSelectionRequest,
): Promise<EstimateGasResponse> {
  const chain = await getInitializedChain<Ethereumish>(req.chain, req.network);
  const connector: Perpish = await getConnector<Perpish>(
    req.chain,
    req.network,
    req.connector,
  );
  return perpEstimateGas(chain, connector);
}
