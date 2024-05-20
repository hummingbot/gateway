import { AccountData, makeCosmoshubPath } from '@cosmjs/proto-signing';
import { Oraichain } from '../../../src/chains/oraichain/oraichain';
import { Bip39, EnglishMnemonic, Slip10, Slip10Curve } from '@cosmjs/crypto';
import { toHex } from '@cosmjs/encoding';

const testContract = 'orai12hzjxfh77wl572gdzct2fxv2arxcwh6gykc7qh';
let oraichain: Oraichain;
let account: AccountData;
// let client: SigningCosmWasmClient;

beforeAll(async () => {
  oraichain = Oraichain.getInstance('mainnet');

  // random account
  const mnemonic = new EnglishMnemonic(
    'enlist hip relief stomach skate base shallow young switch frequent cry park',
  );
  const hdPath = makeCosmoshubPath(0);
  const seed = await Bip39.mnemonicToSeed(mnemonic);
  const masterKey = Slip10.derivePath(Slip10Curve.Secp256k1, seed, hdPath);
  const privateKeyTest = masterKey.privkey;

  const wallet = await oraichain.getWalletFromPrivateKey(
    toHex(privateKeyTest),
    'orai',
  );
  account = (await wallet.getAccounts())[0];
  oraichain.initSigningCosmWasmClient = jest.fn();
  oraichain.getWallet = jest.fn().mockReturnValue(wallet);
  const client = await oraichain.getSigningClient(account.address);
  client.execute = jest.fn().mockReturnValue({});
  client.executeMultiple = jest.fn().mockReturnValue({});
  await oraichain.init();
});

afterAll(async () => {
  await oraichain.close();
});

describe('Getter', () => {
  it('getConnectedInstances', async () => {
    const instances = Oraichain.getConnectedInstances();
    expect(instances).toBeDefined();
  });

  it('getGasPrice', async () => {
    const gasPrice = oraichain.gasPrice;
    expect(gasPrice).toBeDefined();
  });

  it('getChain', async () => {
    const chain = oraichain.chain;
    expect(chain).toBeDefined();
  });

  it('getNativeTokenSymbol', async () => {
    const symbol = oraichain.nativeTokenSymbol;
    expect(symbol).toBeDefined();
  });

  it('getRequestCount', async () => {
    const requestCount = oraichain.requestCount;
    oraichain.requestCounter({ action: 'request' });
    const newRequestCount = oraichain.requestCount;
    expect(requestCount).toEqual(newRequestCount - 1);
    oraichain.metricLogger();
    expect(requestCount).toEqual(0);    
  });

  it('getMetricsLogInterval', async () => {
    const interval = oraichain.metricsLogInterval;
    expect(interval).toBeDefined();
  });

  it('getStoredMarketList', async () => {
    const list = oraichain.storedMarketList;
    expect(list).toBeDefined();
  });

  it('getCosmWasmClient', async () => {
    const client = oraichain.cosmwasmClient;
    expect(client).toBeDefined();
  });
});

describe('Signing client', () => {
  it('should create a signing client', async () => {
    const client = await oraichain.createSigningCosmWasmClient(account.address);
    expect(client).toBeDefined();
  });

  it('should execute single transaction', async () => {
    const res = await oraichain.executeContract(account.address, testContract, {}, {});
    expect(res).toBeDefined();
  });

  it('should execute multiple transaction', async () => {
    const res = await oraichain.executeContractMultiple(account.address, []);
    expect(res).toBeDefined();
  });
});

