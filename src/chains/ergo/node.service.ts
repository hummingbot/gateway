import axios from 'axios';
import {
  NodeChainSliceResponse,
  NodeInfoResponse,
} from './interfaces/node.interface';
import { NodeErgoBoxResponse } from './types/node.type';
import {
  BlockHeaders,
  ErgoStateContext,
  PreHeader,
} from 'ergo-lib-wasm-nodejs';
import { ErgoTxFull } from './interfaces/ergo.interface';

/**
 * This class allows you to access elements of a node
 * @class
 * @param {string} nodeURL - The node's base URL
 * @param {number} timeout - Timeout
 */
export class NodeService {
  constructor(
    private nodeURL: string,
    private timeout: number,
  ) {}

  private async request<ResponseBlock = any>(
    method: 'POST' | 'GET' | 'HEAD' = 'GET',
    url: string,
    headers?: Record<string, string>,
    body?: Record<string, string> | string,
  ) {
    const response = await axios<ResponseBlock>({
      baseURL: this.nodeURL,
      url,
      method,
      headers: headers,
      timeout: this.timeout,
      ...(method === 'POST' ? { data: body } : null),
    });

    return response.data;
  }

  /**
   * Gets network full height
   * @returns number
   * @function
   * @async
   */
  async getNetworkHeight(): Promise<number> {
    const info = await this.request<NodeInfoResponse>('GET', '/info');

    return info.fullHeight;
  }

  /**
   *  Get unspent boxes via wallet address
   * @param {string} address
   * @param {string} offset
   * @param {string} limit
   * @param {string} sortDirection
   * @returns NodeErgoBoxResponse
   * @function
   * @async
   */
  async getUnspentBoxesByAddress(
    address: string,
    offset: number,
    limit: number,
    sortDirection = 'desc',
  ) {
    return this.request<NodeErgoBoxResponse>(
      'POST',
      `/blockchain/box/unspent/byAddress?offset=${offset}&limit=${limit}&sortDirection=${sortDirection}`,
      { 'Content-Type': 'text/plain' },
      `${address}`,
    );
  }

  async chainSliceInfo(height: number): Promise<any> {
    return this.request<NodeChainSliceResponse[]>(
      'GET',
      `/blocks/chainSlice?fromHeight=${height - 10}&toHeight=${height}`,
    );
  }

  async getCtx() {
    const height = await this.getNetworkHeight();
    const blockHeaders = BlockHeaders.from_json(
      await this.chainSliceInfo(height),
    );
    const pre_header = PreHeader.from_block_header(
      blockHeaders.get(blockHeaders.len() - 1),
    );
    return new ErgoStateContext(pre_header, blockHeaders);
  }

  async postTransaction(tx: any): Promise<string> {
    return this.request<any>(
      'POST',
      `/transactions`,
      { 'Content-Type': 'application/json' },
      tx,
    ).catch(() => {
      return '';
    });
  }

  async getTxsById(id: string): Promise<ErgoTxFull | undefined> {
    const result = await this.request<ErgoTxFull | undefined>(
      'GET',
      `/blockchain/transaction/byId/${id}`,
    ).catch((error) => {
      return undefined;
    });
    return result;
  }

  async getBlockInfo(blockHeight: string): Promise<any> {
    const blockId = (await this.request('GET', `/blocks/at/${blockHeight}`))[0];
    return await this.request('GET', `/blocks/${blockId}`);
  }
}
