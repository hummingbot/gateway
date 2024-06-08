import axios from 'axios';
import { NodeInfoResponse } from './interfaces/node.interface';
import { NodeErgoBoxResponse } from './types/node.type';

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
      ...(method === 'POST' ? { body: body } : null),
    });

    return response.data;
  }

  async getNetworkHeight(): Promise<number> {
    const info = await this.request<NodeInfoResponse>('GET', '/info');

    return info.fullHeight;
  }

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
      address,
    );
  }
}
