import {
  FastifyInstance,
  InjectOptions,
  LightMyRequestResponse,
} from 'fastify';

import { AbstractGatewayTestHarness } from './abstract-gateway-test-harness';

export interface APITestCaseParams<
  T extends AbstractGatewayTestHarness<any> = any,
> {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
  url: string;
  expectedStatus: number;
  query?: Record<string, string>;
  payload?: Record<string, any>;
  /**
   * A map of mock keys to their corresponding mock file basenames.
   * The test harness will automatically append the '.json' extension.
   * The keys must correspond to the keys in the Test Harness's dependencyContracts object.
   * @example { 'getLatestBlock': 'mayanode-getLatestBlock-response' }
   */
  requiredMocks?: Partial<
    Record<keyof T['dependencyContracts'], string | string[]>
  >;
  propertyMatchers?: Partial<any>;
}

export class APITestCase<T extends AbstractGatewayTestHarness<any> = any>
  implements InjectOptions
{
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
  url: string;
  expectedStatus: number;
  query: Record<string, string>;
  payload: Record<string, any>;
  requiredMocks: Partial<
    Record<keyof T['dependencyContracts'], string | string[]>
  >;
  propertyMatchers?: Partial<any>;

  constructor({
    method,
    url,
    expectedStatus,
    query = {},
    payload = {},
    requiredMocks = {},
    propertyMatchers,
  }: APITestCaseParams<T>) {
    this.method = method;
    this.url = url;
    this.expectedStatus = expectedStatus;
    this.query = query;
    this.payload = payload;
    this.requiredMocks = requiredMocks;
    this.propertyMatchers = propertyMatchers;
  }

  public async processRecorderRequest(harness: T): Promise<{
    response: LightMyRequestResponse;
    body: any;
  }> {
    const response = await harness.gatewayApp.inject(this);
    await harness.saveMocks(this.requiredMocks);
    this.assertStatusCode(response);
    const body = JSON.parse(response.body);
    this.assertSnapshot(body);
    return { response, body };
  }

  public async processPlayRequest(harness: T): Promise<{
    response: LightMyRequestResponse;
    body: any;
  }> {
    await harness.loadMocks(this.requiredMocks);
    const response = await harness.gatewayApp.inject(this);
    this.assertStatusCode(response);
    const body = JSON.parse(response.body);
    this.assertSnapshot(body);
    return { response, body };
  }

  public assertSnapshot(body: any) {
    if (this.propertyMatchers) {
      expect(body).toMatchSnapshot(this.propertyMatchers);
    } else {
      expect(body).toMatchSnapshot();
    }
  }

  public assertStatusCode(response: LightMyRequestResponse) {
    if (response.statusCode !== this.expectedStatus) {
      console.log('Response body:', response.body);
      expect(response.statusCode).toBe(this.expectedStatus);
      // TODO: check if it has a stack property to log
    }
  }
}
