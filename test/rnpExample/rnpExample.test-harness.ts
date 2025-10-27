import { AbstractGatewayTestHarness } from '#test/record-and-play/abstract-gateway-test-harness';

import { LocallyInitializedDependency, RnpExample } from './api/rnpExample';

export class RnpExampleTestHarness extends AbstractGatewayTestHarness<RnpExample> {
  readonly dependencyContracts = {
    // Defines a contract for `this.dep1.A_basicMethod()`. Since it's listed here,
    // it's "managed" and must be mocked in "Play" tests.
    dep1_A: this.dependencyFactory.instanceProperty('dep1', (x) => x.A_basicMethod),
    dep1_B: this.dependencyFactory.instanceProperty('dep1', (x) => x.B_superJsonMethod),

    // The `allowPassThrough: true` flag creates an exception. `dep1.C_passthroughMethod`
    // is still "managed", but it will call its real implementation during
    // "Play" tests instead of throwing an error if it isn't mocked.
    dep1_C: this.dependencyFactory.instanceProperty('dep1', (x) => x.C_passthroughMethod, true),
    dep1_D: this.dependencyFactory.instanceProperty('dep1', (x) => x.D_usedTwiceInOneCallMethod),

    // This defines a contract for a method on a class prototype. This is
    // necessary for dependencies that are instantiated inside other methods.
    localDep: this.dependencyFactory.prototype(LocallyInitializedDependency, (x) => x.prototypeMethod),

    // CRITICAL NOTE: Because other `dep1` methods are listed above, the entire
    // `dep1` object is now "managed". This means `dep1.unmappedMethod()`
    // will throw an error if called during a "Play" test because it's not
    // explicitly mocked or allowed to pass through.
    //
    // In contrast, `dep2` is not mentioned in `dependencyContracts` at all.
    // It is "unmanaged", so `dep2.unlistedMethod()` will always call its real
    // implementation in both "Record" and "Play" modes.
  };

  constructor() {
    super(__dirname);
  }

  protected async initializeGatewayApp() {
    // This is different from the base class. It creates a new server
    // instance and injects test routes before making it ready.
    const { configureGatewayServer } = await import('../../src/app');
    this._gatewayApp = configureGatewayServer();

    const { rnpExampleRoutes } = await import('#test/rnpExample/api/rnpExample.routes');
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
