import { Avalanche } from '../chains/avalanche/avalanche';
import { Celo } from '../chains/celo/celo';
import { Cronos } from '../chains/cronos/cronos';
import { Ethereum } from '../chains/ethereum/ethereum';
import { BinanceSmartChain } from '../chains/binance-smart-chain/binance-smart-chain';
import { Harmony } from '../chains/harmony/harmony';
import { Polygon } from '../chains/polygon/polygon';
import { Xdc } from '../chains/xdc/xdc';
import { Tezos } from '../chains/tezos/tezos';
import { Osmosis } from '../chains/osmosis/osmosis';
import { XRPL, XRPLish } from '../chains/xrpl/xrpl';
import { MadMeerkat } from '../connectors/mad_meerkat/mad_meerkat';
import { Openocean } from '../connectors/openocean/openocean';
import { Pangolin } from '../connectors/pangolin/pangolin';
import { Perp } from '../connectors/perp/perp';
import { Quickswap } from '../connectors/quickswap/quickswap';
import { PancakeSwap } from '../connectors/pancakeswap/pancakeswap';
import { Uniswap } from '../connectors/uniswap/uniswap';
import { UniswapLP } from '../connectors/uniswap/uniswap.lp';
import { VVSConnector } from '../connectors/vvs/vvs';
import {
  CLOBish,
  Ethereumish,
  Nearish,
  Perpish,
  RefAMMish,
  Uniswapish,
  UniswapLPish,
  Xdcish,
  Tezosish,
} from './common-interfaces';
import { Traderjoe } from '../connectors/traderjoe/traderjoe';
import { Sushiswap } from '../connectors/sushiswap/sushiswap';
import { Near } from '../chains/near/near';
import { Ref } from '../connectors/ref/ref';
import { Xsswap } from '../connectors/xsswap/xsswap';
import { DexalotCLOB } from '../connectors/dexalot/dexalot';
import { Algorand } from '../chains/algorand/algorand';
import { Cosmos } from '../chains/cosmos/cosmos';
import { Tinyman } from '../connectors/tinyman/tinyman';
import { Plenty } from '../connectors/plenty/plenty';
import { Curve } from '../connectors/curve/curve';
import { Kujira } from '../chains/kujira/kujira';
import { KujiraCLOB } from '../connectors/kujira/kujira';
import { PancakeswapLP } from '../connectors/pancakeswap/pancakeswap.lp';
import { XRPLCLOB } from '../connectors/xrpl/xrpl';
import { Carbonamm } from '../connectors/carbon/carbonAMM';
import { Balancer } from '../connectors/balancer/balancer';

export type ChainUnion =
  | Algorand
  | Cosmos
  | Ethereumish
  | Nearish
  | Xdcish
  | Tezosish
  | XRPLish
  | Kujira
  | Osmosis;

export type Chain<T> = T extends Algorand
  ? Algorand
  : T extends Cosmos
    ? Cosmos
    : T extends Ethereumish
      ? Ethereumish
      : T extends Nearish
        ? Nearish
        : T extends Xdcish
          ? Xdcish
          : T extends Tezosish
            ? Tezosish
            : T extends XRPLish
              ? XRPLish
              : T extends KujiraCLOB
                ? KujiraCLOB
                : T extends Osmosis
                  ? Osmosis
                  : never;

export class UnsupportedChainException extends Error {
  constructor(message?: string) {
    message =
      message !== undefined
        ? message
        : 'Please provide a supported chain name.';
    super(message);
    this.name = 'UnsupportedChainError';
    this.stack = (<any>new Error()).stack;
  }
}

export async function getInitializedChain<T>(
  chain: string,
  network: string,
): Promise<Chain<T>> {
  const chainInstance = await getChainInstance(chain, network);

  if (chainInstance === undefined) {
    throw new UnsupportedChainException(`unsupported chain ${chain}`);
  }

  if (!chainInstance.ready()) {
    await chainInstance.init();
  }

  return chainInstance as Chain<T>;
}

export async function getChainInstance(
  chain: string,
  network: string,
): Promise<ChainUnion | undefined> {
  let connection: ChainUnion | undefined;

  if (chain === 'algorand') {
    connection = Algorand.getInstance(network);
  } else if (chain === 'ethereum') {
    connection = Ethereum.getInstance(network);
  } else if (chain === 'avalanche') {
    connection = Avalanche.getInstance(network);
  } else if (chain === 'harmony') {
    connection = Harmony.getInstance(network);
  } else if (chain === 'polygon') {
    connection = Polygon.getInstance(network);
  } else if (chain === 'cronos') {
    connection = Cronos.getInstance(network);
  } else if (chain === 'cosmos') {
    connection = Cosmos.getInstance(network);
  } else if (chain === 'celo') {
    connection = Celo.getInstance(network);
  } else if (chain === 'osmosis') {
    connection = Osmosis.getInstance(network);
  } else if (chain === 'near') {
    connection = Near.getInstance(network);
  } else if (chain === 'binance-smart-chain') {
    connection = BinanceSmartChain.getInstance(network);
  } else if (chain === 'xdc') {
    connection = Xdc.getInstance(network);
  } else if (chain === 'tezos') {
    connection = Tezos.getInstance(network);
  } else if (chain === 'xrpl') {
    connection = XRPL.getInstance(network);
  } else if (chain === 'kujira') {
    connection = Kujira.getInstance(network);
  } else {
    connection = undefined;
  }

  return connection;
}

export type ConnectorUnion =
  | Uniswapish
  | UniswapLPish
  | Perpish
  | RefAMMish
  | CLOBish
  | Tinyman
  | Plenty
  | XRPLCLOB
  | Curve
  | KujiraCLOB

export type Connector<T> = T extends Uniswapish
  ? Uniswapish
  : T extends UniswapLPish
    ? UniswapLPish
    : T extends Perpish
      ? Perpish
      : T extends RefAMMish
        ? RefAMMish
        : T extends CLOBish
          ? CLOBish
          : T extends Tinyman
            ? Tinyman
            : T extends Plenty
              ? Plenty
              : T extends XRPLish
                ? XRPLCLOB
                : T extends KujiraCLOB
                  ? KujiraCLOB
                    : never;

export async function getConnector<T>(
  chain: string,
  network: string,
  connector: string | undefined,
  address?: string,
): Promise<Connector<T>> {
  let connectorInstance: ConnectorUnion;

  if (connector === 'uniswap') {
    connectorInstance = Uniswap.getInstance(chain, network);
  } else if (connector === 'uniswapLP') {
    connectorInstance = UniswapLP.getInstance(chain, network);
  } else if (connector === 'quickswap') {
    connectorInstance = Quickswap.getInstance(chain, network);
  } else if (connector === 'perp') {
    connectorInstance = Perp.getInstance(chain, network, address);
  } else if (connector === 'pangolin') {
    connectorInstance = Pangolin.getInstance(chain, network);
  } else if (connector === 'openocean') {
    connectorInstance = Openocean.getInstance(chain, network);
  } else if (connector === 'traderjoe') {
    connectorInstance = Traderjoe.getInstance(chain, network);
  } else if (connector === 'mad_meerkat') {
    connectorInstance = MadMeerkat.getInstance(chain, network);
  } else if (connector === 'vvs') {
    connectorInstance = VVSConnector.getInstance(chain, network);
  } else if (connector === 'ref') {
    connectorInstance = Ref.getInstance(chain, network);
  } else if (connector === 'pancakeswap') {
    connectorInstance = PancakeSwap.getInstance(chain, network);
  } else if (connector === 'pancakeswapLP') {
    connectorInstance = PancakeswapLP.getInstance(chain, network);
  } else if (connector === 'sushiswap') {
    connectorInstance = Sushiswap.getInstance(chain, network);
  } else if (connector === 'xsswap') {
    connectorInstance = Xsswap.getInstance(chain, network);
  } else if (connector === 'xrpl') {
    connectorInstance = XRPLCLOB.getInstance(chain, network);
  } else if (connector === 'kujira') {
    connectorInstance = KujiraCLOB.getInstance(chain, network);
  } else if (connector === 'curve') {
    connectorInstance = Curve.getInstance(chain, network);
  } else if (connector === 'balancer') {
    connectorInstance = Balancer.getInstance(chain, network);
  } else if (connector === 'carbonamm') {
    connectorInstance = Carbonamm.getInstance(chain, network);
  } else if (connector === 'dexalot') {
    connectorInstance = DexalotCLOB.getInstance(network);
  } else if (connector == 'tinyman') {
    connectorInstance = Tinyman.getInstance(network);
  } else if (connector === 'plenty') {
    connectorInstance = Plenty.getInstance(network);
  } else {
    throw new Error('unsupported chain or connector');
  }

  if (!connectorInstance.ready()) {
    await connectorInstance.init();
  }

  return connectorInstance as Connector<T>;
}
