import axios, { AxiosInstance } from 'axios';

import { GatewayConfig } from '../types';

export class GatewayApiClient {
  private client: AxiosInstance;
  private isGatewayRunning: boolean = true;

  constructor(config: GatewayConfig) {
    this.client = axios.create({
      baseURL: config.url,
      timeout: config.timeout || 5000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add response interceptor to detect if Gateway is not running
    this.client.interceptors.response.use(
      (response) => {
        this.isGatewayRunning = true;
        return response;
      },
      (error) => {
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
          this.isGatewayRunning = false;
        }
        throw error;
      },
    );
  }

  async get<T>(path: string, params?: any): Promise<T> {
    const response = await this.client.get<T>(path, { params });
    return response.data;
  }

  async post<T>(path: string, data?: any): Promise<T> {
    const response = await this.client.post<T>(path, data);
    return response.data;
  }

  async delete<T>(path: string, data?: any): Promise<T> {
    const response = await this.client.delete<T>(path, { data });
    return response.data;
  }

  isRunning(): boolean {
    return this.isGatewayRunning;
  }
}
