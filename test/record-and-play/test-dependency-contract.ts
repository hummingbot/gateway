export interface MockProvider<TInstance> {
  getMock(fileName: string): any;
  instance: TInstance;
}

/**
 * Defines the contract for a dependency that can be mocked for unit tests
 * or spied on for recorder tests.
 */
export abstract class TestDependencyContract<TInstance> {
  // constructor(public readonly mockFileName: string) {}
  constructor() {}

  /**
   * Sets up a spy on a real instance method to record its live output.
   * @returns A tuple containing the spy instance and the generated name for the save function.
   */
  abstract setupSpy(harness: MockProvider<TInstance>): jest.SpyInstance;

  /**
   * Replaces a dependency with a mock for isolated unit testing.
   * @returns A spy instance if one was created, otherwise void.
   */
  setupMock(
    spy: jest.SpyInstance,
    harness: MockProvider<TInstance>,
    mockFileName: string,
  ): void {
    const mockData = harness.getMock(mockFileName);
    spy.mockResolvedValueOnce(mockData);
  }
}

/**
 * Handles dependencies that are properties on the main instance.
 * - For recorder tests, it spies on a method of the real property instance.
 * - For unit tests, it replaces the entire property with a mock object.
 */
export class InstancePropertyDependency<
  TInstance,
  K extends keyof TInstance,
> extends TestDependencyContract<TInstance> {
  constructor(
    // mockFileName: string,
    private instancePropertyKey: K,
    private methodName: keyof TInstance[K],
  ) {
    super();
  }

  setupSpy(harness: MockProvider<TInstance>): jest.SpyInstance {
    const dependencyInstance = harness.instance[this.instancePropertyKey];
    // TODO: check if dependencyInstance is already a spy??
    const spy = jest.spyOn(dependencyInstance as any, this.methodName as any);
    return spy;
  }
}

/**
 * Handles dependencies that exist on a prototype, accessed via a getter method on the instance.
 *
 * NOTE: This approach is preferred over global prototype mocking. Globally mocking a
 * prototype (e.g., via `jest.mock` at the top level) is often fragile and can lead
 * to unintended side effects across the entire test suite, as it pollutes the global
 * state.
 *
 * The recommended pattern is to have the class under test provide a getter method
 * that returns the dependency instance. This allows `PrototypeDependency` to spy on
 * that getter for unit tests, replacing its return value with a mock instance,
 * thereby cleanly isolating the mock without affecting other tests.
 *
 * - For recorder tests, it spies on the real prototype method to capture live data.
 * - For unit tests, it spies on the instance's getter method and returns a mock instance.
 */
export class PrototypeDependency<
  TInstance,
  TPrototype,
> extends TestDependencyContract<TInstance> {
  constructor(
    // mockFileName: string,
    private Klass: new (...args: any[]) => TPrototype,
    private prototypeMethod: keyof TPrototype,
    // private method: keyof TInstance,
  ) {
    super();
  }

  setupSpy(_harness: MockProvider<TInstance>): jest.SpyInstance {
    const spy = jest.spyOn(this.Klass.prototype, this.prototypeMethod as any);
    return spy;
  }
}

export class DependencyFactory<TInstance> {
  instanceProperty<K extends keyof TInstance>(
    instanceKey: K,
    methodName: keyof TInstance[K],
  ): InstancePropertyDependency<TInstance, K> {
    // const finalMockFileName =
    //   mockFileName ||
    //   this.generateMockFileName(String(instanceKey), String(methodName));
    return new InstancePropertyDependency<TInstance, K>(
      instanceKey,
      methodName,
    );
  }

  prototype<TPrototype>(
    Klass: new (...args: any[]) => TPrototype,
    prototypeMethod: keyof TPrototype,
    // instanceMethod: keyof TInstance,
    // mockFileName?: string,
  ): PrototypeDependency<TInstance, TPrototype> {
    // const finalMockFileName =
    //   mockFileName ||
    //   this.generateMockFileName(Klass.name, String(prototypeMethod));
    return new PrototypeDependency<TInstance, TPrototype>(
      // finalMockFileName,
      Klass,
      prototypeMethod,
      // instanceMethod,
    );
  }

  private generateMockFileName(key: string, method: string): string {
    const keySanitized = key
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/^-/, '');
    const keyBase = keySanitized.split('-')[0];
    return `${keyBase}-${method}-response`;
  }
}
