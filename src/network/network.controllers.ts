import { StatusRequest, StatusResponse } from './network.requests';
import {
  HttpException,
  UNKNOWN_CHAIN_ERROR_CODE,
  UNKNOWN_KNOWN_CHAIN_ERROR_MESSAGE,
} from '../services/error-handler';
import {
  getInitializedChain,
  UnsupportedChainException,
} from '../services/connection-manager';
import { Ethereum } from '../chains/ethereum/ethereum';
import { Solana } from '../chains/solana/solana';

export async function getStatus(
  req: StatusRequest,
): Promise<StatusResponse | StatusResponse[]> {
  const statuses: StatusResponse[] = [];
  let connections: any[] = [];
  let chain: string;
  let chainId: number;
  let network: string;
  let rpcUrl: string;
  let currentBlockNumber: number | undefined;
  let nativeCurrency: string;

  if (req.chain) {
    try {
      connections.push(
        await getInitializedChain(req.chain, req.network as string),
      );
    } catch (e) {
      if (e instanceof UnsupportedChainException) {
        throw new HttpException(
          500,
          UNKNOWN_KNOWN_CHAIN_ERROR_MESSAGE(req.chain),
          UNKNOWN_CHAIN_ERROR_CODE,
        );
      }
      throw e;
    }
  } else {
    const ethereumConnections = Ethereum.getConnectedInstances();
    connections = connections.concat(
      ethereumConnections ? Object.values(ethereumConnections) : [],
    );
    const solanaConnections = Solana.getConnectedInstances();
    connections = connections.concat(
      solanaConnections ? Object.values(solanaConnections) : []
    );
  }

  for (const connection of connections) {
    chain = connection.chain;
    chainId = connection.chainId;
    network = connection.network;
    rpcUrl = connection.rpcUrl;
    nativeCurrency = connection.nativeTokenSymbol;

    currentBlockNumber = await connection.getCurrentBlockNumber();
    statuses.push({
      chain,
      chainId,
      network,
      rpcUrl,
      currentBlockNumber,
      nativeCurrency,
    });
  }

  return req.chain ? statuses[0] : statuses;
}
