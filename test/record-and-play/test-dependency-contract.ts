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
export abstract class TestDependencyContract<TInstance, TObject, TMock> {
  /** If true, the real method will be called even during "Play" mode tests. */
  public allowPassThrough: boolean;
  /** The name of the method to be spied on. */
  abstract readonly methodName: keyof TObject;
  /** Returns the object or prototype that contains the method to be spied on. */
  abstract getObject(provider: MockProvider<TInstance>): TObject;
  /** Creates and returns a Jest spy on the dependency's method. */
  abstract setupSpy(provider: MockProvider<TInstance>): jest.SpyInstance;
  /**
   * Attaches a mock implementation to the spy.
   * Can be called multiple times to mock subsequent calls.
   */
  setupMock(spy: jest.SpyInstance, provider: MockProvider<TInstance>, fileName: string, isAsync = true): void {
    const mock = provider.getMock<TMock>(fileName);
    if (isAsync) {
      spy.mockResolvedValueOnce(mock);
    } else {
      spy.mockReturnValueOnce(mock);
    }
  }
}

/**
 * A dependency contract for a method on a class *instance*.
 * This is the most common type of dependency. It should be used for any
 * dependency that is a property of the main service instance being tested.
 * It is required for methods defined with arrow functions.
 */
export class InstancePropertyDependency<TInstance, TObject, TMock> extends TestDependencyContract<
  TInstance,
  TObject,
  TMock
> {
  constructor(
    private getObjectFn: (provider: MockProvider<TInstance>) => TObject,
    public readonly methodName: keyof TObject,
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
export class PrototypeDependency<TInstance, TObject, TMock> extends TestDependencyContract<TInstance, TObject, TMock> {
  constructor(
    private ClassConstructor: { new (...args: any[]): TObject },
    public readonly methodName: keyof TObject,
    public allowPassThrough = false,
  ) {
    super();
  }

  getObject(_provider: MockProvider<TInstance>): TObject {
    return this.ClassConstructor.prototype;
  }

  setupSpy(_provider: MockProvider<TInstance>): jest.SpyInstance {
    return jest.spyOn(this.ClassConstructor.prototype, this.methodName as any);
  }
}

/**
 * Provides factory methods for creating dependency contracts.
 * This should be used within a concrete TestHarness class.
 */
export class DependencyFactory<TInstance> {
  private _extractMethodName<T, TMethod extends (...args: any[]) => any>(selector: (obj: T) => TMethod): keyof T {
    // This is a hack: create a Proxy to intercept the property access
    let prop: string | symbol | undefined;
    const proxy = new Proxy(
      {},
      {
        get(_target, p) {
          prop = p;
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          return () => {};
        },
      },
    ) as T;
    selector(proxy);
    if (!prop) {
      throw new Error('Could not extract method name from selector');
    }
    return prop as keyof T;
  }

  /**
   * Creates a contract for a method on a class instance property.
   * @param instancePropertyName The name of the property on the main service instance that holds the dependency object.
   * @param methodSelector A lambda function that selects the method on the dependency object (e.g., `x => x.myMethod`).
   * @param allowPassThrough If true, the real method is called during "Play" mode.
   */
  instanceProperty<K extends keyof TInstance, TMethod extends (...args: any[]) => any = any>(
    instancePropertyName: K,
    methodSelector: (dep: TInstance[K]) => TMethod,
    allowPassThrough = false,
  ) {
    const methodName = this._extractMethodName(methodSelector);

    type TMock = Awaited<ReturnType<TMethod>>;

    return new InstancePropertyDependency<TInstance, TInstance[K], TMock>(
      (p: MockProvider<TInstance>): TInstance[K] => p.instance[instancePropertyName],
      methodName,
      allowPassThrough,
    );
  }

  /**
   * Creates a contract for a method on a class prototype.
   * WARNING: This will not work for methods defined as arrow functions.
   * @param ClassConstructor The class (not an instance) whose prototype contains the method.
   * @param methodSelector A lambda function that selects the method on the prototype (e.g., `x => x.myMethod`).
   * @param allowPassThrough If true, the real method is called during "Play" mode.
   */
  prototype<TObject, TMethod extends (...args: any[]) => any = any>(
    ClassConstructor: { new (...args: any[]): TObject },
    methodSelector: (obj: TObject) => TMethod,
    allowPassThrough = false,
  ) {
    const methodName = this._extractMethodName(methodSelector);
    type TMock = Awaited<ReturnType<TMethod>>;
    return new PrototypeDependency<TInstance, TObject, TMock>(ClassConstructor, methodName, allowPassThrough);
  }
}
