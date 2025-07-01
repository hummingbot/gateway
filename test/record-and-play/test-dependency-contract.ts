export interface MockProvider {
  getMock(fileName: string): any;
}

/**
 * Defines the contract for a dependency that can be mocked for unit tests
 * or spied on for recorder tests.
 */
export abstract class TestDependencyContract<TInstance> {
  constructor(public mockFileName: string) {}

  /**
   * Sets up a spy on a real instance method to record its live output.
   * @returns A tuple containing the spy instance and the generated name for the save function.
   */
  abstract setupRecorder(instance: TInstance): [jest.SpyInstance, string];

  /**
   * Replaces a dependency with a mock for isolated unit testing.
   * @returns A spy instance if one was created, otherwise void.
   */
  abstract setupUnitTest(
    harness: MockProvider,
    instance: TInstance,
  ): jest.SpyInstance | void;
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
    mockFileName: string,
    private instanceKey: K,
    private methodName: keyof TInstance[K],
  ) {
    super(mockFileName);
  }

  setupRecorder(instance: TInstance): [jest.SpyInstance, string] {
    const dependencyInstance = instance[this.instanceKey];
    const spy = jest.spyOn(dependencyInstance as any, this.methodName as any);
    const saverName = this.getSaverName();
    return [spy, saverName];
  }

  setupUnitTest(harness: MockProvider, instance: TInstance): void {
    const mockData = harness.getMock(this.mockFileName);
    const mockInstance = {
      [this.methodName]: jest.fn().mockResolvedValue(mockData),
    };
    (instance as any)[this.instanceKey] = mockInstance as TInstance[K];
  }

  private getSaverName(): string {
    const methodNameStr = this.methodName as string;
    const methodNameTitleCase =
      methodNameStr.charAt(0).toUpperCase() + methodNameStr.slice(1);
    return `save${methodNameTitleCase}Mock`;
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
    mockFileName: string,
    private Klass: new (...args: any[]) => TPrototype,
    private prototypeMethod: keyof TPrototype,
    private method: keyof TInstance,
  ) {
    super(mockFileName);
  }

  setupRecorder(instance: TInstance): [jest.SpyInstance, string] {
    const methodSpy = jest.spyOn(instance as any, this.method as any);

    methodSpy.mockImplementation(async (...args: any[]) => {
      // Restore the original method to get the real dependency instance
      methodSpy.mockRestore();
      const dependencyInstance = await (instance as any)[this.method](...args);

      // Spy on the method of the real dependency instance
      jest.spyOn(dependencyInstance, this.prototypeMethod as any);

      // Re-spy on the method to return the now-spied-upon dependency instance
      jest
        .spyOn(instance as any, this.method as any)
        .mockReturnValue(dependencyInstance);

      return dependencyInstance;
    });

    const saverName = this.getSaverName();
    return [methodSpy, saverName];
  }

  setupUnitTest(harness: MockProvider, instance: TInstance): jest.SpyInstance {
    const mockData = harness.getMock(this.mockFileName);
    const mockInstance = {
      [this.prototypeMethod]: jest.fn().mockResolvedValue(mockData),
    };
    return jest
      .spyOn(instance as any, this.method as any)
      .mockResolvedValue(mockInstance);
  }

  private getSaverName(): string {
    const methodNameStr = this.prototypeMethod as string;
    const methodNameTitleCase =
      methodNameStr.charAt(0).toUpperCase() + methodNameStr.slice(1);
    return `save${methodNameTitleCase}Mock`;
  }
}

export class DependencyFactory<TInstance> {
  instanceProperty<K extends keyof TInstance>(
    instanceKey: K,
    methodName: keyof TInstance[K],
    mockFileName?: string,
  ): InstancePropertyDependency<TInstance, K> {
    const finalMockFileName =
      mockFileName ||
      this.generateMockFileName(String(instanceKey), String(methodName));
    return new InstancePropertyDependency(
      finalMockFileName,
      instanceKey,
      methodName,
    );
  }

  prototype<TPrototype>(
    Klass: new (...args: any[]) => TPrototype,
    prototypeMethod: keyof TPrototype,
    instanceMethod: keyof TInstance,
    mockFileName?: string,
  ): PrototypeDependency<TInstance, TPrototype> {
    const finalMockFileName =
      mockFileName ||
      this.generateMockFileName(Klass.name, String(prototypeMethod));
    return new PrototypeDependency(
      finalMockFileName,
      Klass,
      prototypeMethod,
      instanceMethod,
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
