import axios, { AxiosHeaders } from 'axios';

export class DexService {
  constructor(
    private dexURL: string,
    private timeout: number = 5000,
  ) {}

  private async request<ResponseBlock>(
    method: 'POST' | 'GET' | 'HEAD' = 'GET',
    url: string,
    headers?: AxiosHeaders,
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
    return this.request('GET', '/ergo-token-list.json');
  }
}
