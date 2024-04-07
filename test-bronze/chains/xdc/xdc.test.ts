jest.useFakeTimers();
import { patch, unpatch } from '../../../test/services/patch';
import { Xdc } from '../../../src/chains/xdc/xdc';
import { patchEVMNonceManager } from '../../../test/evm.nonce.mock';
let xdc: Xdc;

// Fake data for for testing
const TOKENS = [
  {
    chainId: 51,
    address: '0xaD2552941efbAc1532B5C8950EcCdb3EA9DFE68b',
    decimals: 18,
    name: 'Wrapped XDC',
    symbol: 'WXDC',
    logoURI: '',
  },
  {
    chainId: 50,
    address: '0xaD2552941efbAc1532B5C8950EcCdb3EA9DFE68b',
    decimals: 18,
    name: 'Wrapped XDC',
    symbol: 'WXDC',
    logoURI: '',
  },
];

beforeAll(async () => {
  xdc = Xdc.getInstance('apothem');
  // Return the mocked token list instead of getting the list from github
  patch(xdc, 'getTokenList', () => TOKENS);
  patchEVMNonceManager(xdc.nonceManager);
});

beforeEach(() => {
  patchEVMNonceManager(xdc.nonceManager);
});

afterEach(() => {
  unpatch();
});

afterAll(async () => {
  await xdc.close();
});

describe('init', () => {
  it('should wait for the first init() call to finish in future immediate init() calls', async () => {
    let firstCallFullfilled = false;
    xdc.init().then(() => {
      firstCallFullfilled = true;
    });
    await xdc.init().then(() => {
      expect(firstCallFullfilled).toEqual(true);
    });
  });
});

describe('verify xdc storedTokenList', () => {
  it('Should only return tokens in the chain', async () => {
    const tokenList = xdc.storedTokenList;
    // Only one of them has chainId 51
    expect(tokenList).toEqual([TOKENS[0]]);
  });
});
