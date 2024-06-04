import axios from 'axios';
import { DEXTokensResponse } from './interfaces/dex.interface';

export class DexService {
  constructor(
    private dexURL: string,
    private timeout: number = 5000,
  ) {}

  private async request<ResponseBlock = any>(
    method: 'POST' | 'GET' | 'HEAD' = 'GET',
    url: string,
    headers?: Record<string, string>,
    body?: Record<string, string>,
  ) {
    const response = await axios<ResponseBlock>({
      baseURL: this.dexURL,
      url,
      method,
      headers: headers,
      timeout: this.timeout,
      ...(method === 'POST' ? { body: body } : null),
    });

    return response.data;
  }

  async getTokens() {
    return this.request<DEXTokensResponse>('GET', '/ergo-token-list.json');
  }
}
