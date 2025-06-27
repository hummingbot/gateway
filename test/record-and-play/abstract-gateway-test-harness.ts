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

export abstract class AbstractGatewayTestHarness<TInstance>
  implements MockProvider<TInstance>
{
  protected _gatewayApp!: FastifyInstance;
  protected _mockDir: string;
  protected _instance!: TInstance;
  protected readonly dependencyFactory = new DependencyFactory<TInstance>();

  abstract readonly dependencyContracts: Record<
    string,
    ContractWithSpy<TInstance>
  >;

  constructor(mockDir: string) {
    this._mockDir = mockDir;
  }

  protected loadMock(fileName: string): any {
    const filePath = path.join(this._mockDir, 'mocks', `${fileName}.json`);
    if (fs.existsSync(filePath)) {
      return superjson.deserialize(
        JSON.parse(fs.readFileSync(filePath, 'utf8')),
      );
    }
    throw new Error(`Mock file not found: ${filePath}`);
  }

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

  protected async initializeGatewayApp() {
    this._gatewayApp = (await import('../../src/app')).gatewayApp;
    await this._gatewayApp.ready();
  }

  get gatewayApp(): FastifyInstance {
    return this._gatewayApp;
  }

  get instance(): TInstance {
    if (!this._instance)
      throw new Error('Instance not initialized. Call setup first.');
    return this._instance;
  }

  public getMock(fileName: string): any {
    return this.loadMock(fileName);
  }

  abstract init(): Promise<void>;

  private async setupSpies() {
    for (const [_key, dep] of Object.entries(this.dependencyContracts)) {
      const spy = dep.setupSpy(this);
      dep.spy = spy;
    }
  }

  async setupRecorder() {
    await this.init();
    await this.setupSpies();
  }

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
        const data = await dep.spy.mock.results[i].value;
        this._saveMock(filename, data);
      }
    }
  }

  async setupMockedTests() {
    await this.init();
    await this.setupSpies();
    for (const [instanceKey, dep] of Object.entries(this.dependencyContracts)) {
      const object = dep.getObject(this);
      for (const [methodName, method] of Object.entries(object)) {
        if (!(method as any).mock && !dep.allowPassThrough) {
          const spy = jest.spyOn(object, methodName);
          spy.mockImplementation(() => {
            throw new Error(
              `Unmocked method was called: ${instanceKey}.${methodName}`,
            );
          });
        }
      }
    }
  }

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

  async teardown() {
    Object.values(this.dependencyContracts).forEach((dep) => {
      dep.spy.mockRestore();
    });
    if (this._gatewayApp) {
      await this._gatewayApp.close();
    }
  }
}
