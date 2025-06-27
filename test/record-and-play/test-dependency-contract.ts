/**
 * Provides access to the harness's core mocking capabilities.
 * This interface is used by dependency contracts to get mocks and the service instance.
 */
export interface MockProvider<TInstance> {
  getMock<TMock>(fileName: string): TMock;
  instance: TInstance;
}

/**
 * Defines the contract for how a dependency should be spied upon and mocked.
 */
export abstract class TestDependencyContract<TInstance> {
  /** If true, the real method will be called even during "Play" mode tests. */
  public allowPassThrough: boolean;
  /** Returns the object or prototype that contains the method to be spied on. */
  abstract getObject(provider: MockProvider<TInstance>): any;
  /** Creates and returns a Jest spy on the dependency's method. */
  abstract setupSpy(provider: MockProvider<TInstance>): jest.SpyInstance;
  /**
   * Attaches a mock implementation to the spy.
   * Can be called multiple times to mock subsequent calls.
   */
  setupMock<TMock>(
    spy: jest.SpyInstance,
    provider: MockProvider<TInstance>,
    fileName: string,
  ): void {
    const mock = provider.getMock<TMock>(fileName);
    spy.mockResolvedValueOnce(mock);
  }
}

/**
 * A dependency contract for a method on a class *instance*.
 * This is the most common type of dependency. It should be used for any
 * dependency that is a property of the main service instance being tested.
 * It is required for methods defined with arrow functions.
 */
export class InstancePropertyDependency<
  TInstance,
  TObject,
> extends TestDependencyContract<TInstance> {
  constructor(
    private getObjectFn: (provider: MockProvider<TInstance>) => TObject,
    public methodName: keyof TObject,
    public allowPassThrough = false,
  ) {
    super();
  }

  getObject(provider: MockProvider<TInstance>) {
    return this.getObjectFn(provider);
  }

  setupSpy(provider: MockProvider<TInstance>): jest.SpyInstance {
    const object = this.getObject(provider);
    return jest.spyOn(object, this.methodName as any);
  }
}

/**
 * A dependency contract for a method on a class *prototype*.
 * This should be used when the dependency is not an instance property, but a method
 * on the prototype of a class that is instantiated within the code under test.
 *
 * IMPORTANT: This will NOT work for methods defined with arrow functions, as they
 * do not exist on the prototype.
 */
export class PrototypeDependency<
  TInstance,
  TObject,
> extends TestDependencyContract<TInstance> {
  constructor(
    private proto: { new (...args: any[]): TObject },
    public methodName: keyof TObject,
    public allowPassThrough = false,
  ) {
    super();
  }

  getObject(_provider: MockProvider<TInstance>) {
    return this.proto.prototype;
  }

  setupSpy(_provider: MockProvider<TInstance>): jest.SpyInstance {
    return jest.spyOn(this.proto.prototype, this.methodName as any);
  }
}

/**
 * Provides factory methods for creating dependency contracts.
 * This should be used within a concrete TestHarness class.
 */
export class DependencyFactory<TInstance> {
  /**
   * Creates a contract for a method on a class instance property.
   * @param instancePropertyName The name of the property on the main service instance that holds the dependency object.
   * @param methodName The name of the method on the dependency object to spy on.
   * @param allowPassThrough If true, the real method is called during "Play" mode.
   */
  instanceProperty<K extends keyof TInstance>(
    instancePropertyName: K,
    methodName: keyof TInstance[K],
    allowPassThrough = false,
  ) {
    return new InstancePropertyDependency(
      (p: MockProvider<TInstance>): TInstance[K] =>
        p.instance[instancePropertyName],
      methodName,
      allowPassThrough,
    );
  }

  /**
   * Creates a contract for a method on a class prototype.
   * WARNING: This will not work for methods defined as arrow functions.
   * @param proto The class (not an instance) whose prototype contains the method.
   * @param methodName The name of the method on the prototype to spy on.
   * @param allowPassThrough If true, the real method is called during "Play" mode.
   */
  prototype<TObject>(
    proto: { new (...args: any[]): TObject },
    methodName: keyof TObject,
    allowPassThrough = false,
  ) {
    return new PrototypeDependency(proto, methodName, allowPassThrough);
  }
}
