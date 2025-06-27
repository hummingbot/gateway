export interface MockProvider<TInstance> {
  getMock(fileName: string): any;
  instance: TInstance;
}

/**
 * Defines the contract for a dependency that can be utilized for record and play testing.
 */
export abstract class TestDependencyContract<TInstance> {
  /**
   * Sets up a spy on a real method to record or modify its output.
   * @returns The spy instance.
   */
  abstract setupSpy(harness: MockProvider<TInstance>): jest.SpyInstance;

  /**
   * @returns The object that has the property that is being spied on.
   */
  abstract getObject(harness: MockProvider<TInstance>): any;

  /**
   * Whether to allow the dependency to pass through to the real implementation.
   */
  abstract allowPassThrough: boolean;

  /**
   * Replaces a dependency call with a mock for record and play testing.
   * Can be called multiple times to mock subsequent calls to the same dependency.
   * @returns void.
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
 */
export class InstancePropertyDependency<
  TInstance,
  K extends keyof TInstance,
> extends TestDependencyContract<TInstance> {
  constructor(
    private instancePropertyKey: K,
    private methodName: keyof TInstance[K],
    public allowPassThrough: boolean = false,
  ) {
    super();
  }

  setupSpy(harness: MockProvider<TInstance>): jest.SpyInstance {
    const dependencyInstance = harness.instance[this.instancePropertyKey];
    const spy = jest.spyOn(dependencyInstance as any, this.methodName as any);
    return spy;
  }

  getObject(harness: MockProvider<TInstance>): any {
    return harness.instance[this.instancePropertyKey];
  }
}

/**
 * Handles dependencies that exist on a prototype, e.g. a class which is initialized inside a method.
 *
 */
export class PrototypeDependency<
  TInstance,
  TPrototype,
> extends TestDependencyContract<TInstance> {
  constructor(
    private Klass: new (...args: any[]) => TPrototype,
    private prototypeMethod: keyof TPrototype,
    public allowPassThrough: boolean = false,
  ) {
    super();
  }

  setupSpy(_harness: MockProvider<TInstance>): jest.SpyInstance {
    const spy = jest.spyOn(this.Klass.prototype, this.prototypeMethod as any);
    return spy;
  }

  getObject(_harness: MockProvider<TInstance>): any {
    return this.Klass.prototype;
  }
}

export class DependencyFactory<TInstance> {
  instanceProperty<K extends keyof TInstance>(
    instanceKey: K,
    methodName: keyof TInstance[K],
    allowPassThrough: boolean = false,
  ): InstancePropertyDependency<TInstance, K> {
    return new InstancePropertyDependency<TInstance, K>(
      instanceKey,
      methodName,
      allowPassThrough,
    );
  }

  prototype<TPrototype>(
    Klass: new (...args: any[]) => TPrototype,
    prototypeMethod: keyof TPrototype,
    allowPassThrough: boolean = false,
  ): PrototypeDependency<TInstance, TPrototype> {
    return new PrototypeDependency<TInstance, TPrototype>(
      Klass,
      prototypeMethod,
      allowPassThrough,
    );
  }
}
