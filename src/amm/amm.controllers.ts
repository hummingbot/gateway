import {
  EstimateGasResponse,
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
  price as tinymanPrice,
  trade as tinymanTrade,
  estimateGas as tinymanEstimateGas,
} from '../connectors/tinyman/tinyman.controllers';
import {
  price as plentyPrice,
  trade as plentyTrade,
  estimateGas as plentyEstimateGas,
} from '../connectors/plenty/plenty.controllers';
import {
  getInitializedChain,
  getConnector,
} from '../services/connection-manager';
import {
  Chain as Ethereumish,
  NetworkSelectionRequest,
  Tezosish,
  Uniswapish,
  UniswapLPish,
} from '../services/common-interfaces';
import { Algorand } from '../chains/algorand/algorand';
import { Tinyman } from '../connectors/tinyman/tinyman';
import { Plenty } from '../connectors/plenty/plenty';
import { Osmosis } from '../chains/osmosis/osmosis';
import { Carbonamm } from '../connectors/carbon/carbonAMM';
import { Spectrum } from '../connectors/spectrum/spectrum';
import { Ergo } from '../chains/ergo/ergo';

export async function price(req: PriceRequest): Promise<PriceResponse> {
  const chain = await getInitializedChain<
    Algorand | Ethereumish | Tezosish | Osmosis | Ergo
  >(req.chain, req.network);
  if (chain instanceof Osmosis) {
    return chain.controller.price(chain as unknown as Osmosis, req);
  }

  const connector:
    | Uniswapish
    | Tinyman
    | Plenty
    | Spectrum = await getConnector<
      Uniswapish | Tinyman | Plenty | Spectrum
    >(req.chain, req.network, req.connector);

  if (connector instanceof Plenty) {
    return plentyPrice(<Tezosish>chain, connector, req);
  } else if (connector instanceof Carbonamm) {
    return carbonPrice(<Ethereumish>chain, connector, req);
  } else if ('routerAbi' in connector) {
    // we currently use the presence of routerAbi to distinguish Uniswapish from RefAMMish
    return uniswapPrice(<Ethereumish>chain, connector, req);
  } else if (connector instanceof Spectrum) {
    return connector.estimateTrade(req);
  } else return tinymanPrice(chain as unknown as Algorand, connector, req);
}

export async function trade(req: TradeRequest): Promise<TradeResponse> {
  const chain = await getInitializedChain<
    Algorand | Ethereumish | Tezosish | Osmosis | Ergo
  >(req.chain, req.network);
  if (chain instanceof Osmosis) {
    return chain.controller.trade(chain as unknown as Osmosis, req);
  }

  const connector:
    | Uniswapish
    | Tinyman
    | Plenty
    | Spectrum = await getConnector<
      Uniswapish | Tinyman | Plenty | Spectrum
    >(req.chain, req.network, req.connector);

  if (connector instanceof Plenty) {
    return plentyTrade(<Tezosish>chain, connector, req);
  } else if (connector instanceof Carbonamm) {
    return carbonTrade(<Ethereumish>chain, connector, req);
  } else if ('routerAbi' in connector) {
    return uniswapTrade(<Ethereumish>chain, connector, req);
  } else if (connector instanceof Spectrum) {
    return connector.executeTrade(req);
  } else {
    return tinymanTrade(chain as unknown as Algorand, connector, req);
  }
}

export async function addLiquidity(
  req: AddLiquidityRequest,
): Promise<AddLiquidityResponse> {
  const chain = await getInitializedChain<Ethereumish | Osmosis>(
    req.chain,
    req.network,
  );
  if (chain instanceof Osmosis) {
    return chain.controller.addLiquidity(chain as unknown as Osmosis, req);
  }
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
  const chain = await getInitializedChain<Ethereumish | Osmosis>(
    req.chain,
    req.network,
  );
  if (chain instanceof Osmosis) {
    return chain.controller.removeLiquidity(chain as unknown as Osmosis, req);
  }
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
  const chain = await getInitializedChain<Ethereumish | Osmosis>(
    req.chain,
    req.network,
  );
  if (chain instanceof Osmosis) {
    return chain.controller.collectFees(chain as unknown as Osmosis, req);
  }
  const connector: UniswapLPish = await getConnector<UniswapLPish>(
    req.chain,
    req.network,
    req.connector,
  );
  return uniswapV3CollectEarnedFees(chain, connector, req);
}

export async function positionInfo(
  req: PositionRequest,
): Promise<PositionResponse> {
  const chain = await getInitializedChain<Ethereumish | Osmosis>(
    req.chain,
    req.network,
  );
  if (chain instanceof Osmosis) {
    return chain.controller.poolPositions(chain as unknown as Osmosis, req);
  }
  const connector: UniswapLPish = await getConnector<UniswapLPish>(
    req.chain,
    req.network,
    req.connector,
  );
  return uniswapV3PositionInfo(chain, connector, req);
}

export async function poolPrice(
  req: PoolPriceRequest,
): Promise<PoolPriceResponse> {
  const chain = await getInitializedChain<Ethereumish | Osmosis>(
    req.chain,
    req.network,
  );
  if (chain instanceof Osmosis) {
    return chain.controller.poolPrice(chain as unknown as Osmosis, req);
  }
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
  const chain = await getInitializedChain<
    Algorand | Ethereumish | Tezosish | Osmosis
  >(req.chain, req.network);
  if (chain instanceof Osmosis) {
    return chain.controller.estimateGas(chain as unknown as Osmosis);
  }

  const connector: Uniswapish | Tinyman | Plenty =
    await getConnector<Uniswapish | Tinyman | Plenty>(
      req.chain,
      req.network,
      req.connector,
    );

  if (connector instanceof Plenty) {
    return plentyEstimateGas(<Tezosish>chain, connector);
  } else if (connector instanceof Carbonamm) {
    return carbonEstimateGas(<Ethereumish>chain, connector);
  } else if ('routerAbi' in connector) {
    return uniswapEstimateGas(<Ethereumish>chain, connector);
  } else {
    return tinymanEstimateGas(chain as unknown as Algorand, connector);
  }
}
