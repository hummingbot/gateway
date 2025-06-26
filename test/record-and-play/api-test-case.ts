import {
  FastifyInstance,
  InjectOptions,
  LightMyRequestResponse,
} from 'fastify';

import { AbstractGatewayTestHarness } from './abstract-gateway-test-harness';

export class APITestCase<T extends AbstractGatewayTestHarness<any> = any>
  implements InjectOptions
{
  constructor(
    public method:
      | 'GET'
      | 'POST'
      | 'PUT'
      | 'DELETE'
      | 'PATCH'
      | 'OPTIONS'
      | 'HEAD',
    public url: string,
    public expectedStatus: number,
    public query: Record<string, string>,
    public payload: Record<string, any>,
    /**
     * A map of mock keys to their corresponding mock file basenames.
     * The test harness will automatically append the '.json' extension.
     * The keys must correspond to the keys in the Test Harness's dependencyContracts object.
     * @example { 'getLatestBlock': 'mayanode-getLatestBlock-response' }
     */
    public requiredMocks: Partial<
      Record<keyof T['dependencyContracts'], string>
    >,
    public propertyMatchers?: Partial<any>,
  ) {}

  public async processRecorderRequest(
    harness: T,
    propertyMatchers?: Partial<any>,
  ): Promise<{
    response: LightMyRequestResponse;
    body: any;
  }> {
    const response = await harness.gatewayApp.inject(this);
    await harness.saveMocks(this.requiredMocks);
    if (response.statusCode !== this.expectedStatus) {
      console.log('Response body:', response.body);
      expect(response.statusCode).toBe(this.expectedStatus);
    }
    const body = JSON.parse(response.body);
    this.assertSnapshot(body, propertyMatchers);
    return { response, body };
  }

  public async processPlayRequest(
    harness: T,
    propertyMatchers?: Partial<any>,
  ): Promise<{
    response: LightMyRequestResponse;
    body: any;
  }> {
    await harness.setupMocksForTest(this.requiredMocks);
    const response = await harness.gatewayApp.inject(this);
    expect(response.statusCode).toBe(this.expectedStatus);
    const body = JSON.parse(response.body);
    this.assertSnapshot(body, propertyMatchers);
    return { response, body };
  }

  public assertSnapshot(body: any, propertyMatchers?: Partial<any>) {
    if (propertyMatchers || this.propertyMatchers) {
      expect(body).toMatchSnapshot(propertyMatchers || this.propertyMatchers);
    } else {
      expect(body).toMatchSnapshot();
    }
  }
}
