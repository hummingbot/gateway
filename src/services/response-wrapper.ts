import { latency } from './base';

export interface BaseResponse {
  timestamp: number;
  latency: number;
}

export function wrapResponse<T>(data: T, initTime: number): T & BaseResponse {
  return {
    timestamp: initTime,
    latency: latency(initTime, Date.now()),
    ...data
  };
} 