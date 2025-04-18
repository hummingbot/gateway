import axios from 'axios';
import { DEXTokensResponse } from './interfaces/dex.interface';

/**
 * This class allows you to access elements of a DEX
 * @class
 * @param {string} dexURL - The DEX's base URL
 * @param {number} [timeout=5000] - Timeout
 */
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

  /**
   *  This function allow you to get Ergo's token list from DEX
   * @function
   * @async
   */
  async getTokens() {
    return this.request<DEXTokensResponse>('GET', '/ergo-token-list.json');
  }
}
