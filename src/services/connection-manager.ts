import { Ethereum } from '../chains/ethereum/ethereum';
import { Solana } from '../chains/solana/solana';
import { Uniswap } from '../connectors/uniswap/uniswap';
import { Jupiter } from '../connectors/jupiter/jupiter';
import { Meteora } from '../connectors/meteora/meteora';


export interface Chain {
  // TODO: Add shared chain properties (e.g., network, chainId, etc.)
}

export type ChainInstance = Ethereum | Solana;

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
    connection = Ethereum.getInstance(network);
  } else if (chain === 'solana') {
    connection = await Solana.getInstance(network);
  } else {
    connection = undefined;
  }

  return connection;
}

export interface Connector {
  // TODO: Add shared connector properties (e.g., config, getQuote, etc.)
}

export async function getConnector(
  chain: string,
  network: string,
  connector: string | undefined,
): Promise<Connector> {
  if (connector === 'uniswap') {
    return Uniswap.getInstance(chain, network);
  } else if (connector === 'jupiter') {
    return await Jupiter.getInstance(network);
  } else if (connector === 'meteora') {
    return await Meteora.getInstance(network);
  } else {
    throw new Error('unsupported chain or connector');
  }
}
