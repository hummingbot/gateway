import axios, { AxiosInstance } from 'axios'

export class DexService {
  private backend: AxiosInstance

  constructor(dexURL: string, timeOut: number) {
    this.backend = axios.create({
      baseURL: dexURL,
      timeout: timeOut,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  async get(url: string, headers?: any, params?: any) {
    return this.backend.get(url, {
      timeout: 25000,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      params
    }).then((res: any) => res.data)
  }

  async head(url: string) {
    return this.backend.head(url, {
      timeout: 1000
    }).then((res: any) => res.status).catch((e: any) => e.response.status)
  }

  async post(url: string, headers?: any, params?: any) {
    this.backend.defaults.headers = {
      'Content-Type': 'application/json',
      ...headers
    }
    this.backend.defaults.timeout = 25000
    return this.backend.post(url, params).then((res: any) => res)
  }

  async getTokens() {
    return this.get('/ergo-token-list.json')
  }

}
