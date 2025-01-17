import { Avalanche } from '../chains/avalanche/avalanche';
import { Celo } from '../chains/celo/celo';
import { Cronos } from '../chains/cronos/cronos';
import { Ethereum } from '../chains/ethereum/ethereum';
import { BinanceSmartChain } from '../chains/binance-smart-chain/binance-smart-chain';
import { Harmony } from '../chains/harmony/harmony';
import { Polygon } from '../chains/polygon/polygon';
import { Xdc } from '../chains/xdc/xdc';
import { Tezos } from '../chains/tezos/tezos';
import { Telos } from '../chains/telos/telos';
import { Osmosis } from '../chains/osmosis/osmosis';
import { Solana } from '../chains/solana/solana';
import { MadMeerkat } from '../connectors/mad_meerkat/mad_meerkat';
import { Openocean } from '../connectors/openocean/openocean';
import { Pangolin } from '../connectors/pangolin/pangolin';
import { Quickswap } from '../connectors/quickswap/quickswap';
import { PancakeSwap } from '../connectors/pancakeswap/pancakeswap';
import { Uniswap } from '../connectors/uniswap/uniswap';
import { UniswapLP } from '../connectors/uniswap/uniswap.lp';
import { VVSConnector } from '../connectors/vvs/vvs';
import {
  Ethereumish,
  Uniswapish,
  UniswapLPish,
  Xdcish,
  Tezosish,
} from './common-interfaces';
import { Traderjoe } from '../connectors/traderjoe/traderjoe';
import { Sushiswap } from '../connectors/sushiswap/sushiswap';
import { Xsswap } from '../connectors/xsswap/xsswap';
import { Algorand } from '../chains/algorand/algorand';
import { Cosmos } from '../chains/cosmos/cosmos';
import { Tinyman } from '../connectors/tinyman/tinyman';
import { Plenty } from '../connectors/plenty/plenty';
import { Curve } from '../connectors/curve/curve';
import { PancakeswapLP } from '../connectors/pancakeswap/pancakeswap.lp';
import { Carbonamm } from '../connectors/carbon/carbonAMM';
import { Balancer } from '../connectors/balancer/balancer';
import { ETCSwapLP } from '../connectors/etcswap/etcswap.lp';
import { EthereumClassicChain } from '../chains/ethereum-classic/ethereum-classic';
import { ETCSwap } from '../connectors/etcswap/etcswap';
import { Jupiter } from '../connectors/jupiter/jupiter';
import { Ton } from '../chains/ton/ton';
import { Stonfi } from '../connectors/ston_fi/ston_fi';

export type ChainUnion =
  | Algorand
  | Cosmos
  | Ethereumish
  | Xdcish
  | Tezosish
  | Osmosis
  | Solana
  | Ton;

export type Chain<T> = T extends Algorand
  ? Algorand
  : T extends Cosmos
    ? Cosmos
    : T extends Ethereumish
      ? Ethereumish
        : T extends Xdcish
          ? Xdcish
            : T extends Tezosish
              ? Tezosish
                : T extends Osmosis
                  ? Osmosis
                    : T extends Solana
                      ? Solana
                        : T extends Ton
                          ? Ton
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
  } else if (chain === 'solana') {
    connection = Solana.getInstance(network);
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
  } else if (chain === 'binance-smart-chain') {
    connection = BinanceSmartChain.getInstance(network);
  } else if (chain === 'xdc') {
    connection = Xdc.getInstance(network);
  } else if (chain === 'tezos') {
    connection = Tezos.getInstance(network);
  } else if (chain === 'telos') {
    connection = Telos.getInstance(network);
  } else if (chain === 'ethereum-classic') {
    connection = EthereumClassicChain.getInstance(network);
  } else if (chain === 'ton') {
    connection = Ton.getInstance(network);
  } else {
    connection = undefined;
  }

  return connection;
}

export type ConnectorUnion =
  | Uniswapish
  | UniswapLPish
  | Tinyman
  | Plenty
  | Curve
  | Jupiter
  | Stonfi;

export type Connector<T> = T extends Uniswapish
  ? Uniswapish
  : T extends UniswapLPish
    ? UniswapLPish
      : T extends Tinyman
        ? Tinyman
        : T extends Plenty
          ? Plenty
          : T extends Jupiter
            ? Jupiter
            : T extends Stonfi
              ? Stonfi
                : never;

export async function getConnector<T>(
  chain: string,
  network: string,
  connector: string | undefined,
): Promise<Connector<T>> {
  let connectorInstance: ConnectorUnion;

  if (connector === 'uniswap') {
    connectorInstance = Uniswap.getInstance(chain, network);
  } else if (connector === 'uniswapLP') {
    connectorInstance = UniswapLP.getInstance(chain, network);
  } else if (connector === 'jupiter') {
    connectorInstance = Jupiter.getInstance(network);
  } else if (connector === 'quickswap') {
    connectorInstance = Quickswap.getInstance(chain, network);
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
  } else if (connector === 'pancakeswap') {
    connectorInstance = PancakeSwap.getInstance(chain, network);
  } else if (connector === 'pancakeswapLP') {
    connectorInstance = PancakeswapLP.getInstance(chain, network);
  } else if (connector === 'sushiswap') {
    connectorInstance = Sushiswap.getInstance(chain, network);
  } else if (connector === 'xsswap') {
    connectorInstance = Xsswap.getInstance(chain, network);
  } else if (connector === 'curve') {
    connectorInstance = Curve.getInstance(chain, network);
  } else if (connector === 'balancer') {
    connectorInstance = Balancer.getInstance(chain, network);
  } else if (connector === 'carbonamm') {
    connectorInstance = Carbonamm.getInstance(chain, network);
  } else if (connector == 'tinyman') {
    connectorInstance = Tinyman.getInstance(network);
  } else if (connector === 'plenty') {
    connectorInstance = Plenty.getInstance(network);
  } else if (chain === 'ethereum-classic' && connector === 'etcswap') {
    connectorInstance = ETCSwap.getInstance(chain, network);
  } else if (chain === 'ethereum-classic' && connector === 'etcswapLP') {
    connectorInstance = ETCSwapLP.getInstance(chain, network);
  } else if (connector == 'stonfi') {
    connectorInstance = Stonfi.getInstance(network);
  } else {
    throw new Error('unsupported chain or connector');
  }

  if (!connectorInstance.ready()) {
    await connectorInstance.init();
  }

  return connectorInstance as Connector<T>;
}
