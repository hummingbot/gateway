import { BigNumber, ethers } from 'ethers';

import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { quoteCache } from '../../../../src/services/quote-cache';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/ethereum/ethereum');
jest.mock('../../../../src/services/quote-cache');

// Permit2 expirations are uint48. Max uint48 is the "never expires" sentinel
// written by /approve; multiplied by 1000 it lands far outside the range JS
// Date can represent, which used to make toISOString() throw "Invalid time value".
const MAX_UINT48 = 281474976710655;

const UNIVERSAL_ROUTER = '0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af';

const mockUSDG = {
  symbol: 'USDG',
  address: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
  decimals: 6,
  name: 'Global Dollar',
};

const mockWETH = {
  symbol: 'WETH',
  address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  decimals: 18,
  name: 'Wrapped Ether',
};

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { executeQuoteRoute } = await import('../../../../src/connectors/uniswap/router-routes/executeQuote');
  await server.register(executeQuoteRoute);
  return server;
};

describe('POST /execute-quote — Permit2 expiration handling', () => {
  let server: any;
  let permit2Expiration: BigNumber;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    permit2Expiration = BigNumber.from(MAX_UINT48);

    // Cached quote: BUY 0.003 WETH paying USDG, mirroring the failing bot order
    (quoteCache.get as jest.Mock).mockReturnValue({
      request: { inputToken: mockUSDG, outputToken: mockWETH, side: 'BUY', amount: 0.003 },
      quote: {
        trade: {
          inputAmount: { quotient: '5824451', toExact: () => '5.824451' },
          outputAmount: { toExact: () => '0.003' },
        },
        methodParameters: { calldata: '0xdeadbeef', value: '0x0', to: UNIVERSAL_ROUTER },
      },
    });

    // ERC20 allowance to Permit2 is unlimited, so we reach the Permit2 check
    const mockTokenContract = {
      allowance: jest.fn().mockResolvedValue(ethers.constants.MaxUint256),
    };

    const mockProvider = {
      getTransactionCount: jest.fn().mockResolvedValue(0),
    };

    const mockWallet = {
      sendTransaction: jest.fn().mockResolvedValue({ hash: '0xabc' }),
    };

    (Ethereum.getInstance as jest.Mock).mockResolvedValue({
      nativeTokenSymbol: 'ETH',
      chainId: 5151,
      provider: mockProvider,
      isHardwareWallet: jest.fn().mockResolvedValue(false),
      getContract: jest.fn().mockReturnValue(mockTokenContract),
      getWallet: jest.fn().mockResolvedValue(mockWallet),
      prepareGasOptions: jest.fn().mockResolvedValue({ gasLimit: BigNumber.from(500000) }),
      handleTransactionExecution: jest.fn().mockResolvedValue({
        transactionHash: '0xabc',
        gasUsed: BigNumber.from(210000),
        status: 1,
      }),
      handleExecuteQuoteTransactionConfirmation: jest.fn().mockReturnValue({ status: 1, signature: '0xabc' }),
    });

    // Permit2.allowance() returns [amount, expiration, nonce]
    jest.spyOn(ethers, 'Contract').mockImplementation(
      () =>
        ({
          allowance: jest.fn().mockImplementation(async () => {
            const amount = ethers.BigNumber.from('146150163733090291820368483271628301965593254297');
            return Object.assign([amount, permit2Expiration, BigNumber.from(0)], {
              amount,
              expiration: permit2Expiration,
              nonce: BigNumber.from(0),
            });
          }),
        }) as any,
    );
  });

  const post = () =>
    server.inject({
      method: 'POST',
      url: '/execute-quote',
      payload: {
        network: 'robinhoodchain',
        walletAddress: '0xDA50C69342216b538Daf06FfECDa7363E0B96684',
        quoteId: 'test-quote-id',
      },
    });

  it('executes the swap when the Permit2 allowance never expires (max uint48)', async () => {
    const response = await post();

    // Regression: this used to 500 with "Invalid time value" because the
    // max-uint48 sentinel was passed to new Date(...).toISOString()
    expect(response.body).not.toContain('Invalid time value');
    expect(response.statusCode).toBe(200);
  });

  it('executes the swap when the Permit2 allowance never expires (expiration = 0)', async () => {
    permit2Expiration = BigNumber.from(0);

    const response = await post();

    expect(response.body).not.toContain('Invalid time value');
    expect(response.statusCode).toBe(200);
  });

  it('rejects with a readable date when the Permit2 allowance has expired', async () => {
    const expiredAt = Math.floor(Date.now() / 1000) - 3600;
    permit2Expiration = BigNumber.from(expiredAt);

    const response = await post();

    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain('Invalid time value');
    expect(response.body).toContain('has expired');
    expect(response.body).toContain(new Date(expiredAt * 1000).toISOString());
  });
});
