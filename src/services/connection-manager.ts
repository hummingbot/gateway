import { Ethereum } from '../chains/ethereum/ethereum';
import { Solana } from '../chains/solana/solana';
import { Polkadot } from "../chains/polkadot/polkadot";


export interface Chain {
  // TODO: Add shared chain properties (e.g., network, chainId, etc.)
}

export type ChainInstance = Ethereum | Solana | Polkadot;

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

export async function getInitializedChain<_T>(
  chain: string,
  network: string,
): Promise<ChainInstance> {
  const chainInstance = await getChainInstance(chain, network) as ChainInstance;

  if (chainInstance === undefined) {
    throw new UnsupportedChainException(`unsupported chain ${chain}`);
  }

  return chainInstance;
}

export async function getChainInstance(
  chain: string,
  network: string,
): Promise<ChainInstance | undefined> {
  let connection: ChainInstance | undefined;

  if (chain === 'ethereum') {
    connection = await Ethereum.getInstance(network);
  } else if (chain === 'solana') {
    connection = await Solana.getInstance(network);
  } else if (chain === 'polkadot') {
    connection = await Polkadot.getInstance(network);
  } else {
    connection = undefined;
  }

  return connection;
}

export interface Connector {
  // TODO: Add shared connector properties (e.g., config, getQuote, etc.)
}

export async function getConnector(
  _chain: string, // Parameter kept for compatibility but no longer used by Uniswap
  network: string,
  connector: string | undefined,
): Promise<Connector> {
  // Dynamically import connector classes only when needed
  if (connector === 'uniswap') {
    const { Uniswap } = await import('../connectors/uniswap/uniswap');
    return await Uniswap.getInstance(network);
  } else if (connector === 'jupiter') {
    const { Jupiter } = await import('../connectors/jupiter/jupiter');
    return await Jupiter.getInstance(network);
  } else if (connector === 'meteora') {
    const { Meteora } = await import('../connectors/meteora/meteora');
    return await Meteora.getInstance(network);
  } else if (connector === 'hydration') {
    const { Hydration } = await import('../connectors/hydration/hydration');
    return await Hydration.getInstance(network);
  } else {
    throw new Error('unsupported chain or connector');
  }
}
