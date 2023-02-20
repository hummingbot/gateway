import { patchEVMNonceManager } from '../../evm.nonce.mock';
import { patch } from '../../services/patch';

jest.useFakeTimers();
jest.setTimeout(30000);
import { Openocean } from '../../../src/connectors/openocean/openocean';
import { UniswapishPriceError } from '../../../src/services/error-handler';
import { Token } from '@uniswap/sdk';
import { BigNumber } from 'ethers';
import { Harmony } from '../../../src/chains/harmony/harmony';

let harmony: Harmony;
let openocean: Openocean;

const USDC = new Token(
  1666600000,
  '0x985458E523dB3d53125813eD68c274899e9DfAb4',
  6,
  '1USDC'
);
const DAI = new Token(
  1666600000,
  '0xEf977d2f931C1978Db5F6747666fa1eACB0d0339',
  18,
  '1DAI'
);
const mooOneBIFI = new Token(
  1666600000,
  '0x6207536011918F1A0D8a53Bc426f4Fd54df2E5a8',
  18,
  'mooOneBIFI'
);

const patchStoredTokenList = () => {
  patch(harmony, 'tokenList', () => {
    return [
      {
        chainId: 1666600000,
        name: 'USDC',
        symbol: '1USDC',
        address: '0x985458E523dB3d53125813eD68c274899e9DfAb4',
        decimals: 6,
      },
      {
        chainId: 1666600000,
        name: 'DAI',
        symbol: '1DAI',
        address: '0xEf977d2f931C1978Db5F6747666fa1eACB0d0339',
        decimals: 18,
      },
      {
        chainId: 1666600000,
        name: 'mooOneBIFI',
        symbol: 'mooOneBIFI',
        address: '0x6207536011918F1A0D8a53Bc426f4Fd54df2E5a8',
        decimals: 18,
      },
    ];
  });
};

beforeAll(async () => {
  harmony = Harmony.getInstance('mainnet');
  patchEVMNonceManager(harmony.nonceManager);
  patchStoredTokenList();
  await harmony.init();
  openocean = Openocean.getInstance('harmony', 'mainnet');
  await openocean.init();
});

describe('verify Openocean estimateSellTrade', () => {
  it('Should return an ExpectedTrade when available', async () => {
    const expectedTrade = await openocean.estimateSellTrade(
      USDC,
      DAI,
      BigNumber.from((10 ** USDC.decimals).toString())
    );
    expect(expectedTrade).toHaveProperty('trade');
    expect(expectedTrade).toHaveProperty('expectedAmount');
  });

  it('Should throw an error if no pair is available', async () => {
    await expect(async () => {
      await openocean.estimateSellTrade(
        USDC,
        mooOneBIFI,
        BigNumber.from((10 ** USDC.decimals).toString())
      );
    }).rejects.toThrow(UniswapishPriceError);
  });
});

describe('verify Openocean estimateBuyTrade', () => {
  it('Should return an ExpectedTrade when available', async () => {
    const expectedTrade = await openocean.estimateBuyTrade(
      USDC,
      DAI,
      BigNumber.from((10 ** DAI.decimals).toString())
    );
    expect(expectedTrade).toHaveProperty('trade');
    expect(expectedTrade).toHaveProperty('expectedAmount');
  });

  it('Should return an error if no pair is available', async () => {
    await expect(async () => {
      await openocean.estimateBuyTrade(
        USDC,
        mooOneBIFI,
        BigNumber.from((10 ** mooOneBIFI.decimals).toString())
      );
    }).rejects.toThrow(UniswapishPriceError);
  });
});
