import {
  StatusRequest,
  StatusResponse,
  TokensRequest,
  TokensResponse,
} from './network.requests';
import { Avalanche } from '../chains/avalanche/avalanche';
import { BinanceSmartChain } from '../chains/binance-smart-chain/binance-smart-chain';
import { Ethereum } from '../chains/ethereum/ethereum';
import { Harmony } from '../chains/harmony/harmony';
import { Polygon } from '../chains/polygon/polygon';
import { Injective } from '../chains/injective/injective';
import { Xdc } from '../chains/xdc/xdc';
import {
  HttpException,
  UNKNOWN_CHAIN_ERROR_CODE,
  UNKNOWN_KNOWN_CHAIN_ERROR_MESSAGE,
} from '../services/error-handler';
import { EthereumBase, TokenInfo } from '../chains/ethereum/ethereum-base';
import { Cronos } from '../chains/cronos/cronos';
import { Near } from '../chains/near/near';
import { Nearish, Xdcish } from '../services/common-interfaces';
import { Algorand } from '../chains/algorand/algorand';
import {
  getInitializedChain,
  UnsupportedChainException,
} from '../services/connection-manager';

export async function getStatus(
  req: StatusRequest
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
        await getInitializedChain(req.chain, req.network as string)
      );
    } catch (e) {
      if (e instanceof UnsupportedChainException) {
        throw new HttpException(
          500,
          UNKNOWN_KNOWN_CHAIN_ERROR_MESSAGE(req.chain),
          UNKNOWN_CHAIN_ERROR_CODE
        );
      }
      throw e;
    }
  } else {
    const algorandConnections = Algorand.getConnectedInstances();
    connections = connections.concat(
      algorandConnections ? Object.values(algorandConnections) : []
    );

    const avalancheConnections = Avalanche.getConnectedInstances();
    connections = connections.concat(
      avalancheConnections ? Object.values(avalancheConnections) : []
    );

    const harmonyConnections = Harmony.getConnectedInstances();
    connections = connections.concat(
      harmonyConnections ? Object.values(harmonyConnections) : []
    );

    const ethereumConnections = Ethereum.getConnectedInstances();
    connections = connections.concat(
      ethereumConnections ? Object.values(ethereumConnections) : []
    );

    const polygonConnections = Polygon.getConnectedInstances();
    connections = connections.concat(
      polygonConnections ? Object.values(polygonConnections) : []
    );
    const xdcConnections = Xdc.getConnectedInstances();
    connections = connections.concat(
      xdcConnections ? Object.values(xdcConnections) : []
    );
    const cronosConnections = Cronos.getConnectedInstances();
    connections = connections.concat(
      cronosConnections ? Object.values(cronosConnections) : []
    );

    const nearConnections = Near.getConnectedInstances();
    connections = connections.concat(
      nearConnections ? Object.values(nearConnections) : []
    );

    const bscConnections = BinanceSmartChain.getConnectedInstances();
    connections = connections.concat(
      bscConnections ? Object.values(bscConnections) : []
    );

    const injectiveConnections = Injective.getConnectedInstances();
    connections = connections.concat(
      injectiveConnections ? Object.values(injectiveConnections) : []
    );
  }

  for (const connection of connections) {
    chain = connection.chain;
    chainId = connection.chainId;
    network = connection.network;
    rpcUrl = connection.rpcUrl;
    nativeCurrency = connection.nativeTokenSymbol;

    try {
      currentBlockNumber = await connection.getCurrentBlockNumber();
    } catch (_e) {
      if (await connection.provider.getNetwork()) currentBlockNumber = 1; // necessary for connectors like hedera that do not have concept of blocknumber
    }
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

export async function getTokens(req: TokensRequest): Promise<TokensResponse> {
  type connectionType = EthereumBase | Nearish | Injective | Xdcish;
  let connection: connectionType;
  let tokens: TokenInfo[] = [];

  if (req.chain && req.network) {
    try {
      connection = (await getInitializedChain(
        req.chain as string,
        req.network as string
      )) as connectionType;
    } catch (e) {
      if (e instanceof UnsupportedChainException) {
        throw new HttpException(
          500,
          UNKNOWN_KNOWN_CHAIN_ERROR_MESSAGE(req.chain),
          UNKNOWN_CHAIN_ERROR_CODE
        );
      }
      throw e;
    }
  } else {
    throw new HttpException(
      500,
      UNKNOWN_KNOWN_CHAIN_ERROR_MESSAGE(req.chain),
      UNKNOWN_CHAIN_ERROR_CODE
    );
  }

  if (!req.tokenSymbols) {
    tokens = connection.storedTokenList;
  } else {
    for (const t of req.tokenSymbols as []) {
      tokens.push(connection.getTokenForSymbol(t) as TokenInfo);
    }
  }

  return { tokens };
}
