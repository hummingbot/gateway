import * as fs from 'fs';
import * as path from 'path';

import { FastifyInstance } from 'fastify';
import superjson from 'superjson';

import {
  DependencyFactory,
  MockProvider,
  TestDependencyContract,
} from './test-dependency-contract';

interface ContractWithSpy<TInstance> extends TestDependencyContract<TInstance> {
  spy?: jest.SpyInstance;
}

/**
 * The abstract base class for a Record and Play (RnP) test harness.
 *
 * A test harness is the central engine for a test suite. It is responsible for:
 * 1.  Initializing the application instance under test.
 * 2.  Defining the `dependencyContracts`, which declare all external dependencies.
 * 3.  Orchestrating the setup of spies for recording and mocks for playing.
 *
 * @template TInstance The type of the application class being tested.
 */
export abstract class AbstractGatewayTestHarness<TInstance>
  implements MockProvider<TInstance>
{
  protected _gatewayApp!: FastifyInstance;
  protected _mockDir: string;
  protected _instance!: TInstance;
  protected readonly dependencyFactory = new DependencyFactory<TInstance>();

  /**
   * A map of dependency contracts for the service under test.
   * This is the core of the RnP framework. Each key is a human-readable alias
   * for a dependency, and the value is a contract defining how to spy on or mock it.
   */
  abstract readonly dependencyContracts: Record<
    string,
    ContractWithSpy<TInstance>
  >;

  /**
   * @param mockDir The directory where mock files are stored, typically `__dirname`.
   */
  constructor(mockDir: string) {
    this._mockDir = mockDir;
  }

  /**
   * Loads a serialized mock file from the `/mocks` subdirectory.
   * @param fileName The name of the mock file (without the .json extension).
   * @returns The deserialized mock data.
   */
  protected loadMock<TMock>(fileName: string): TMock {
    const filePath = path.join(this._mockDir, 'mocks', `${fileName}.json`);
    if (fs.existsSync(filePath)) {
      return superjson.deserialize<TMock>(
        JSON.parse(fs.readFileSync(filePath, 'utf8')),
      );
    }
    throw new Error(`Mock file not found: ${filePath}`);
  }

  /**
   * Saves data as a serialized mock file in the `/mocks` subdirectory.
   * @param fileName The name of the mock file to create.
   * @param data The data to serialize and save.
   */
  protected _saveMock(fileName: string, data: any): void {
    const mockDir = path.join(this._mockDir, 'mocks');
    if (!fs.existsSync(mockDir)) {
      fs.mkdirSync(mockDir, { recursive: true });
    }
    const serialized = superjson.serialize(data);
    fs.writeFileSync(
      path.join(mockDir, `${fileName}.json`),
      JSON.stringify(serialized, null, 2),
    );
  }

  /**
   * Initializes the Fastify gateway application instance.
   */
  protected async initializeGatewayApp() {
    this._gatewayApp = (await import('../../src/app')).gatewayApp;
    await this._gatewayApp.ready();
  }

  /** The initialized Fastify application. */
  get gatewayApp(): FastifyInstance {
    return this._gatewayApp;
  }

  /** The initialized instance of the service being tested. */
  get instance(): TInstance {
    if (!this._instance)
      throw new Error('Instance not initialized. Call setup first.');
    return this._instance;
  }

  /**
   * Public accessor to load a mock file.
   * Required by the MockProvider interface.
   * @param fileName The name of the mock file.
   */
  public getMock<TMock>(fileName: string): TMock {
    return this.loadMock<TMock>(fileName);
  }

  /**
   * Initializes the instance of the service being tested.
   * Must be implemented by the concrete harness class.
   */
  protected abstract init(): Promise<void>;

  /**
   * Iterates through the dependencyContracts and creates a Jest spy for each one.
   * This is a prerequisite for both recording and mocking.
   */
  private async setupSpies() {
    for (const [_key, dep] of Object.entries(this.dependencyContracts)) {
      if (!dep.spy) {
        const spy = dep.setupSpy(this);
        dep.spy = spy;
      }
    }
  }

  /**
   * Prepares the harness for a "Recorder" test run.
   * It initializes the service instance and sets up spies on all declared dependencies.
   */
  async initRecorderTests() {
    await this.init();
    await this.setupSpies();
  }

  /**
   * Saves the results of spied dependency calls to mock files.
   * @param requiredMocks A map where keys are dependency contract aliases and
   * values are the filenames for the mocks to be saved.
   */
  public async saveMocks(requiredMocks: Record<string, string | string[]>) {
    for (const [key, filenames] of Object.entries(requiredMocks)) {
      const dep = this.dependencyContracts[key];
      if (!dep.spy) {
        throw new Error(`Spy for mock key "${key}" not found.`);
      }
      for (const [i, filename] of (Array.isArray(filenames)
        ? filenames
        : [filenames]
      ).entries()) {
        const result = dep.spy.mock.results[i];
        if (!result) {
          throw new Error(
            `Spy for dependency "${key}" was only called ${dep.spy.mock.calls.length} time(s), but a mock was required for call number ${i + 1}.`,
          );
        }
        const data = await result.value;
        this._saveMock(filename, data);
      }
    }
  }

  /**
   * Prepares the harness for a "Play" unit test run.
   * It initializes the service, sets up spies, and then implements a crucial
   * safety feature: any method on a "managed" dependency that is NOT explicitly
   * mocked will throw an error if called. This prevents accidental live network calls.
   */
  async initMockedTests() {
    await this.init();
    await this.setupSpies();

    // Get a set of all unique objects that are "managed" by at least one contract.
    const managedObjects = new Set<any>();
    Object.values(this.dependencyContracts).forEach((dep) => {
      managedObjects.add(dep.getObject(this));
    });

    // For every method on each managed object, ensure it's either explicitly
    // mocked or configured to throw an error.
    for (const object of managedObjects) {
      for (const methodName of Object.keys(object)) {
        // Find if a contract exists for this specific method.
        const contract = Object.values(this.dependencyContracts).find(
          (c) =>
            c.getObject(this) === object &&
            (c as any).methodName === methodName,
        );

        if (contract) {
          // This method IS listed in dependencyContracts.
          // If it's not allowed to pass through, set a default error for when
          // a test case forgets to load a specific mock for it.
          if (contract.spy && !contract.allowPassThrough) {
            const depKey = Object.keys(this.dependencyContracts).find(
              (k) => this.dependencyContracts[k] === contract,
            );
            contract.spy.mockImplementation(() => {
              throw new Error(
                `Mocked dependency was called without a mock loaded: ${depKey}. Either load a mock or allowPassThrough.`,
              );
            });
          }
        } else {
          // This method is NOT in dependencyContracts, but it's on a managed object.
          // It's an "unmapped" method and must be spied on to throw an error.
          if (typeof object[methodName] === 'function') {
            const spy = jest.spyOn(object, methodName as any);
            spy.mockImplementation(() => {
              // Find a representative key for this object from the dependency contracts.
              const representativeKey = Object.keys(
                this.dependencyContracts,
              ).find(
                (key) =>
                  this.dependencyContracts[key].getObject(this) === object,
              );

              const depKey = representativeKey || object.constructor.name;
              throw new Error(
                `Unmapped method was called: ${depKey}.${methodName}. Method must be listed and either mocked or specify allowPassThrough.`,
              );
            });
          }
        }
      }
    }
  }

  /**
   * Loads mock files and attaches them to the corresponding dependency spies.
   * @param requiredMocks A map where keys are dependency contract aliases and
   * values are the filenames of the mocks to load.
   */
  public async loadMocks(requiredMocks: Record<string, string | string[]>) {
    for (const [key, filenames] of Object.entries(requiredMocks)) {
      const dep = this.dependencyContracts[key];
      if (!dep.spy) {
        throw new Error(
          `Dependency contract with key '${key}' not found in harness.`,
        );
      }
      for (const fileName of Array.isArray(filenames)
        ? filenames
        : [filenames]) {
        dep.setupMock(dep.spy, this, fileName);
      }
    }
  }

  /**
   * Clears the call history of all spies.
   * This should be run between tests to ensure isolation.
   */
  async reset() {
    Object.values(this.dependencyContracts).forEach((dep) => {
      if (dep.spy) {
        dep.spy.mockClear();
      }
    });
  }

  /**
   * Restores all spies to their original implementations and closes the gateway app.
   * This should be run after the entire test suite has completed.
   */
  async teardown() {
    Object.values(this.dependencyContracts).forEach((dep) => {
      if (dep.spy) {
        dep.spy.mockRestore();
      }
    });
    if (this._gatewayApp) {
      await this._gatewayApp.close();
    }
  }
}
