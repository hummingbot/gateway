import { patchEVMNonceManager } from '../../evm.nonce.mock';
import { patch } from '../../services/patch';

jest.useFakeTimers();
jest.setTimeout(30000);
import { Openocean } from '../../../src/connectors/openocean/openocean';
import { UniswapishPriceError } from '../../../src/services/error-handler';
import { Token } from '@uniswap/sdk';
import { BigNumber } from 'ethers';
import { Ethereum } from '../../../src/chains/ethereum/ethereum';

let ethereum: Ethereum;
let openocean: Openocean;

const USDC = new Token(
  1,
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  6,
  'USDC'
);
const BUSD = new Token(
  1,
  '0x4Fabb145d64652a948d72533023f6E7A623C7C53',
  18,
  'BUSD'
);
const ocUSDC = new Token(
  1,
  '0x8ED9f862363fFdFD3a07546e618214b6D59F03d4',
  8,
  'ocUSDC'
);

const patchStoredTokenList = () => {
  const tokenListFn = () => {
    return [
      {
        chainId: 1,
        name: 'USDC',
        symbol: 'USDC',
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 6,
      },
      {
        chainId: 1,
        name: 'BUSD',
        symbol: 'BUSD',
        address: '0x4Fabb145d64652a948d72533023f6E7A623C7C53',
        decimals: 18,
      },
      {
        chainId: 1,
        name: 'ocUSDC',
        symbol: 'ocUSDC',
        address: '0x8ED9f862363fFdFD3a07546e618214b6D59F03d4',
        decimals: 18,
      },
    ];
  };
  patch(ethereum, 'tokenList', tokenListFn);
  patch(openocean, 'tokenList', tokenListFn);
};

beforeAll(async () => {
  ethereum = Ethereum.getInstance('mainnet');
  patchEVMNonceManager(ethereum.nonceManager);
  await ethereum.init();
  openocean = Openocean.getInstance('ethereum', 'mainnet');
  await openocean.init();
  patchStoredTokenList();
});

describe('verify Openocean estimateSellTrade', () => {
  it('Should return an ExpectedTrade when available', async () => {
    const expectedTrade = await openocean.estimateSellTrade(
      USDC,
      BUSD,
      BigNumber.from((10 ** USDC.decimals).toString())
    );
    expect(expectedTrade).toHaveProperty('trade');
    expect(expectedTrade).toHaveProperty('expectedAmount');
  });

  it('Should throw an error if no pair is available', async () => {
    await expect(async () => {
      await openocean.estimateSellTrade(
        USDC,
        ocUSDC,
        BigNumber.from((10 ** USDC.decimals).toString())
      );
    }).rejects.toThrow(UniswapishPriceError);
  });
});

describe('verify Openocean estimateBuyTrade', () => {
  it('Should return an ExpectedTrade when available', async () => {
    const expectedTrade = await openocean.estimateBuyTrade(
      USDC,
      BUSD,
      BigNumber.from((10 ** BUSD.decimals).toString())
    );
    expect(expectedTrade).toHaveProperty('trade');
    expect(expectedTrade).toHaveProperty('expectedAmount');
  });

  it('Should return an error if no pair is available', async () => {
    await expect(async () => {
      await openocean.estimateBuyTrade(
        USDC,
        ocUSDC,
        BigNumber.from((10 ** ocUSDC.decimals).toString())
      );
    }).rejects.toThrow(UniswapishPriceError);
  });
});
