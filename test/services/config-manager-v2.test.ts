import fs from 'fs';
import fsp from 'fs/promises';
import fse from 'fs-extra';
import os from 'os';
import path from 'path';
import {
  deepCopy,
  ConfigManagerV2,
  ConfigurationNamespace,
  ConfigRootSchemaPath,
} from '../../src/services/config-manager-v2';

describe('Configuration manager v2 tests', () => {
  const testDataSourcePath: string = fse.realpathSync(
    path.join(__dirname, 'data/config-manager-v2')
  );
  let tempDirPath: string = '';
  let configManager: ConfigManagerV2;

  beforeEach(async () => {
    // Create a temp dir in project
    tempDirPath = await fsp.mkdtemp(
      path.join(os.tmpdir(), 'config-manager-v2-unit-test')
    );
    tempDirPath = fse.realpathSync(tempDirPath);

    // Copy the test data into a temp dir.
    await fse.copy(testDataSourcePath, tempDirPath);

    // Create a valid configuration manager from the temp dir.
    configManager = new ConfigManagerV2(
      path.join(tempDirPath, 'test1/root.yml')
    );
  });

  afterEach(async () => {
    // Delete the temp dir.
    fs.rmSync(tempDirPath, { force: true, recursive: true });
    tempDirPath = '';

    // Delete any default configs.
    ConfigManagerV2.setDefaults('ethereum', {});
  });

  it('loading a valid configuration root', (done) => {
    expect(configManager.get('server.certificatePath')).toBeDefined();
    expect(configManager.get('ethereum.networks')).toBeDefined();
    done();
  });

  it('loading an invalid configuration root', (done) => {
    expect(() => {
      new ConfigManagerV2(path.join(tempDirPath, 'test1/invalid-root.yml'));
    }).toThrow();
    expect(() => {
      new ConfigManagerV2(path.join(tempDirPath, 'test1/invalid-root-3.yml'));
    }).toThrow();
    expect(() => {
      new ConfigManagerV2(path.join(tempDirPath, 'test1/invalid-root-4.yml'));
    }).toThrow();
    done();
  });

  it('loading an invalid config file', (done) => {
    expect(() => {
      new ConfigManagerV2(path.join(tempDirPath, 'test1/invalid-root-2.yml'));
    }).toThrow();
    expect(() => {
      new ConfigManagerV2(
        path.join(tempDirPath, 'test1/invalid-root-defira.yml')
      );
    }).toThrow();
    done();
  });

  it('reading from config file', (done) => {
    expect(configManager.get('server.certificatePath')).toEqual('gateway.crt');
    expect(configManager.get('ethereum.networks.mainnet.chainID')).toEqual(1);
    expect(
      configManager.get('ethereum.networks.mainnet.nativeCurrencySymbol')
    ).toEqual('ETH');
    done();
  });

  it('reading a non-existent config entry', (done) => {
    expect(configManager.get('ethereum.sepolia.chainID')).toBeUndefined();
    expect(configManager.get('server.keyPath.keyPath')).toBeUndefined();
    done();
  });

  it('reading invalid config keys', (done) => {
    expect(() => {
      configManager.get('server');
    }).toThrow();
    done();
    expect(() => {
      configManager.get('noSuchNamespace.networks');
    }).toThrow();
  });

  it('writing a valid configuration', (done) => {
    const newKeyPath: string = 'new-gateway.crt';
    configManager.set('server.certificatePath', newKeyPath);
    configManager.set('ethereum.networks.sepolia.chainID', 970);
    configManager.set('ethereum.networks.mainnet', {
      chainID: 61,
      nodeURL: 'http://localhost:8561',
      tokenListType: 'URL',
      tokenListSource:
        'https://wispy-bird-88a7.uniswap.workers.dev/?url=http://tokens.1inch.eth.link',
      nativeCurrencySymbol: 'ETH',
    });
    expect(configManager.get('server.certificatePath')).toEqual(newKeyPath);

    const verifyConfigManager: ConfigManagerV2 = new ConfigManagerV2(
      path.join(tempDirPath, 'test1/root.yml')
    );
    expect(verifyConfigManager.get('server.certificatePath')).toEqual(
      newKeyPath
    );
    expect(verifyConfigManager.get('ethereum.networks.sepolia.chainID')).toEqual(
      970
    );
    expect(
      verifyConfigManager.get('ethereum.networks.mainnet.chainID')
    ).toEqual(61);
    done();
  });

  it('writing an invalid configuration', (done) => {
    expect(() => {
      configManager.set('server.nonKeyPath', 'noSuchFile.txt');
    }).toThrow();
    expect(() => {
      configManager.set('ethereum', {});
    }).toThrow();
    done();
  });

  it('using default configurations', (done) => {
    ConfigManagerV2.setDefaults('ethereum', {
      networks: {
        rinkeby: {
          chainID: 4,
          nodeURL: 'http://localhost:8504',
        },
      },
    });
    expect(configManager.get('ethereum.networks.rinkeby.chainID')).toEqual(4);
    done();
  });

  it('getting namespace objects', (done) => {
    const serverNamespace: ConfigurationNamespace = configManager.getNamespace(
      'server'
    ) as ConfigurationNamespace;
    expect(path.basename(serverNamespace.schemaPath)).toEqual(
      'server-schema.json'
    );
    expect(path.dirname(serverNamespace.schemaPath)).toEqual(
      path.dirname(ConfigRootSchemaPath)
    );
    expect(serverNamespace.configurationPath).toEqual(
      path.join(tempDirPath, 'test1/server.yml')
    );
    done();
  });

  it('Test upgradability', () => {
    expect(configManager.get('server.logPath')).toEqual('./logs');
  });

  it('Dummy test to attempt migration', () => {
    const configManager2 = new ConfigManagerV2(
      path.join(tempDirPath, 'test1/root2.yml')
    );
    expect(configManager2.get('server.certificatePath')).toBeDefined();
  });

  it('Test deep copy', (done) => {
    const templateObj: any = {
      a: 1,
      b: { c: { f: 5, g: 6 }, d: 3 },
      e: 4,
      j: [{ i: '0' }, { k: '1' }],
      l: { m: [1, 2, 3], n: [9, 7, 8] },
    };
    const configObj: any = {
      a: 9,
      b: { c: 8, d: 7 },
      e: 6,
      f: '5',
      g: { h: 4 },
      h: ['1', '2'],
      j: [{ i: '3' }, { k: '4' }],
      l: { m: [9, 7, 8], n: [1, 2, 3] },
    };
    deepCopy(configObj, templateObj);
    expect(templateObj.a).toEqual(9);
    expect(templateObj.b.d).toEqual(7);
    expect(templateObj.b.c).toEqual({ f: 5, g: 6 });
    expect(templateObj.e).toEqual(6);
    expect(templateObj.f).toEqual('5');
    expect(templateObj.g).toEqual({ h: 4 });
    expect(templateObj.h).toEqual(['1', '2']);
    expect(templateObj.j).toEqual([{ i: '3' }, { k: '4' }]);
    expect(templateObj.l.m).toEqual([9, 7, 8]);
    expect(templateObj.l.n).toEqual([1, 2, 3]);
    done();
  });

  it('Get all configuration', (done) => {
    const allConfigs = configManager.allConfigurations;
    expect(allConfigs.server.certificatePath).toEqual('gateway.crt');
    expect(allConfigs.ethereum.networks.mainnet.chainID).toEqual(1);
    done();
  });

  it.skip('Get instance', (done) => {
    // Skipping this test as it relies on actual config files that may change
    let configManager = ConfigManagerV2.getInstance();
    expect(configManager.allConfigurations.server.logToStdOut).toEqual(
      true
    );
    configManager = ConfigManagerV2.getInstance();
    done();
  });
});

describe('Sample configurations', () => {
  it.skip('Read sample schemas', (done) => {
    // Skipping this test as it relies on actual template files that may change
    const sampleConfigManager = new ConfigManagerV2('./src/templates/root.yml');
    expect(sampleConfigManager.get('server.certificatePath')).toBeDefined();
    done();
  });
});
