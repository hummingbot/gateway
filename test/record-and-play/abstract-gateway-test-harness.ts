import * as fs from 'fs';
import * as path from 'path';

import { FastifyInstance } from 'fastify';
import superjson from 'superjson';

import {
  DependencyFactory,
  MockProvider,
  TestDependencyContract,
} from './test-dependency-contract';

export abstract class AbstractGatewayTestHarness<TInstance>
  implements MockProvider
{
  protected _gatewayApp!: FastifyInstance;
  protected _mockDir: string;
  protected _instance!: TInstance;
  protected readonly dependencyFactory = new DependencyFactory<TInstance>();
  protected _spies: Record<string, jest.SpyInstance> = {};

  abstract readonly dependencyContracts: Record<
    string,
    TestDependencyContract<TInstance>
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

  async setupRecorder() {
    await this.init();

    for (const key in this.dependencyContracts) {
      const dep = this.dependencyContracts[key];
      const [spy] = dep.setupRecorder(this.instance);
      this._spies[key] = spy;
    }
  }

  public async saveMocks(mocksToSave: Record<string, string>) {
    for (const [key, filename] of Object.entries(mocksToSave)) {
      const spy = this._spies[key];
      if (!spy) {
        throw new Error(`Spy for mock key "${key}" not found.`);
      }
      const data = await spy.mock.results[spy.mock.results.length - 1].value;
      this._saveMock(filename, data);
    }
  }

  public async setupMocksForTest(mocksToSetup: Record<string, string>) {
    for (const [key, mockFileName] of Object.entries(mocksToSetup)) {
      const contract = this.dependencyContracts[key];
      if (!contract) {
        throw new Error(
          `Dependency contract with key '${key}' not found in harness.`,
        );
      }
      const originalFileName = contract.mockFileName;
      contract.mockFileName = mockFileName;
      const spy = contract.setupUnitTest(this, this.instance);
      contract.mockFileName = originalFileName; // restore it
      if (spy) {
        this._spies[key] = spy;
      }
    }
  }

  async teardown() {
    Object.values(this._spies).forEach((spy) => spy.mockRestore());
    this._spies = {};
    if (this._gatewayApp) {
      await this._gatewayApp.close();
    }
  }
}
