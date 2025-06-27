import { AbstractGatewayTestHarness } from '#test/record-and-play/abstract-gateway-test-harness';

import { RnpExample } from './api/rnpExample';

export class RnpExampleTestHarness extends AbstractGatewayTestHarness<RnpExample> {
  readonly dependencyContracts = {
    dep1_A: this.dependencyFactory.instanceProperty('dep1', 'methodA'),
    dep1_B: this.dependencyFactory.instanceProperty('dep1', 'methodB'),
    dep1_C: this.dependencyFactory.instanceProperty('dep1', 'methodC', true),
    dep1_D: this.dependencyFactory.instanceProperty('dep1', 'methodD'),

    // TODO: prototype dependency examples
    // TODO: explain that unlisted deps will be ignored
  };

  constructor() {
    super(__dirname);
  }

  protected async initializeGatewayApp() {
    // This is different from the base class. It creates a new server
    // instance and injects test routes before making it ready.
    const { configureGatewayServer } = await import('../../src/app');
    this._gatewayApp = configureGatewayServer();

    const { rnpExampleRoutes } = await import(
      '#test/rnpExample/api/rnpExample.routes'
    );
    await this._gatewayApp.register(rnpExampleRoutes, {
      prefix: '/rnpExample',
    });

    await this._gatewayApp.ready();
  }

  async init() {
    await this.initializeGatewayApp();
    this._instance = await RnpExample.getInstance('TEST');
  }

  async teardown() {
    await super.teardown();
  }
}
