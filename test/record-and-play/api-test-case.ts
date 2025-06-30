import { InjectOptions, LightMyRequestResponse } from 'fastify';

import { AbstractGatewayTestHarness } from './abstract-gateway-test-harness';

/**
 * Defines the parameters for a single API test case.
 */
interface APITestCaseParams<Harness extends AbstractGatewayTestHarness<any>> {
  /** The HTTP method for the request. */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
  /** The URL for the API endpoint. */
  url: string;
  /** The expected HTTP status code of the response. */
  expectedStatus: number;
  /** An object representing the query string parameters. */
  query?: Record<string, string>;
  /** The payload/body for POST or PUT requests. */
  payload?: Record<string, any>;
  /**
   * A map of dependency contracts to the mock files they should use.
   * The key must match a key in the harness's `dependencyContracts`.
   * The value is the name of the mock file (or an array of names for sequential calls).
   */
  requiredMocks?: Partial<
    Record<keyof Harness['dependencyContracts'], string | string[]>
  >;
  /** An object of Jest property matchers (e.g., `{ a: expect.any(String) }`)
   * to allow for non-deterministic values in snapshot testing. */
  propertyMatchers?: Record<string, any>;
}

/**
 * Represents a single, reusable API test case.
 *
 * This class encapsulates the entire lifecycle of an API test, from making the
 * request to handling mocks and validating the response against a snapshot.
 * It is the "single source of truth" that is used by both the "Recorder"
 * and "Play" test suites, ensuring they are always synchronized.
 *
 * @template Harness The type of the test harness this case will be run with.
 */
export class APITestCase<Harness extends AbstractGatewayTestHarness<any>>
  implements InjectOptions
{
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
  url: string;
  expectedStatus: number;
  query: Record<string, string>;
  payload: Record<string, any>;
  requiredMocks: Partial<
    Record<keyof Harness['dependencyContracts'], string | string[]>
  >;
  propertyMatchers?: Partial<any>;
  private params: APITestCaseParams<Harness>;

  constructor(params: APITestCaseParams<Harness>) {
    this.params = params;
    this.method = params.method;
    this.url = params.url;
    this.expectedStatus = params.expectedStatus;
    this.query = params.query || {};
    this.payload = params.payload || {};
    this.requiredMocks = params.requiredMocks || {};
    this.propertyMatchers = params.propertyMatchers;
  }

  /**
   * Executes the test case in "Recorder" mode.
   * It makes a live API call and then saves the results of all dependent calls
   * (as defined in `requiredMocks`) to mock files.
   * @param harness The test harness instance.
   */
  public async processRecorderRequest(harness: Harness): Promise<{
    response: LightMyRequestResponse;
    body: any;
  }> {
    const response = await harness.gatewayApp.inject(this);
    this.assertStatusCode(response);
    await harness.saveMocks(this.requiredMocks);
    const body = JSON.parse(response.body);
    this.assertSnapshot(body);
    return { response, body };
  }

  /**
   * Executes the test case in "Play" mode.
   * It loads all `requiredMocks` to intercept dependency calls, makes the API
   * request against the in-memory application, and validates the response.
   * @param harness The test harness instance.
   */
  public async processPlayRequest(harness: Harness): Promise<{
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
      let body: any;
      try {
        body = JSON.parse(response.body);
      } catch (e) {
        // If parsing fails, body remains undefined and we'll use response.body directly
      }

      const reason = body?.message || response.body || 'Unexpected status code';
      const message = `Test failed with status ${response.statusCode} (expected ${this.expectedStatus}).\nReason: ${reason}`;

      const error = new Error(message);

      if (body?.stack) {
        error.stack = `Error: ${message}\n    --\n${body.stack}`;
      }

      throw error;
    }
  }
}
