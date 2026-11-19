import { EvmTransactionCaptured } from '../../../src/chains/ethereum/evm-build-mode';
import { UnsignedTransactionCaptured } from '../../../src/chains/solana/solana-build-mode';
import { fastifyWithTypeProvider } from '../../utils/testUtils';
import { parseWire } from '../../utils/wire';

// /trading/router/build-swap answers with the build in its chain's shape and the quote the
// transaction embeds. Both shapes go through one response schema (a union of the two,
// intersected with the quote), so this pins that neither loses a field in serialization.

const mockQuoteSwap = jest.fn();
const mockExecuteQuote = jest.fn();
jest.mock('../../../src/trading/connector-registry', () => ({
  ...jest.requireActual('../../../src/trading/connector-registry'),
  getRouterOps: () => ({
    quoteSwap: (...args: any[]) => mockQuoteSwap(...args),
    executeQuote: (...args: any[]) => mockExecuteQuote(...args),
  }),
}));

const EVM_WALLET = '0xDA50C69342216b538Daf06FfECDa7363E0B96684';
const QUOTE = {
  quoteId: 'q-1',
  tokenIn: '0x4200000000000000000000000000000000000006',
  tokenOut: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  amountIn: 0.0003,
  amountOut: 0.75,
  price: 2500,
  priceImpactPct: 0.01,
  minAmountOut: 0.74,
  maxAmountIn: 0.0003,
};
const EVM_BUILT = {
  unsignedTransaction: {
    chainId: 8453,
    from: EVM_WALLET,
    to: '0x6fF5693b99212Da76ad316178A184AB56D299b43',
    data: '0x3593564c',
    value: '300000000000000',
    nonce: 12,
    gasLimit: '180000',
    type: 2,
    maxFeePerGas: '12000000',
    maxPriorityFeePerGas: '1000000',
  },
  approvals: [],
  simulated: true,
};

describe('POST /trading/router/build-swap', () => {
  let app: any;

  beforeAll(async () => {
    app = fastifyWithTypeProvider();
    await app.register(require('@fastify/sensible'));
    const { buildSwapRoute } = await import('../../../src/trading/trading-router-routes/buildSwap');
    await app.register(buildSwapRoute);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockQuoteSwap.mockReset().mockResolvedValue(QUOTE);
    mockExecuteQuote.mockReset();
  });

  const swap = (payload: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: '/build-swap',
      payload: { baseToken: 'WETH', quoteToken: 'USDC', amount: 0.0003, side: 'SELL', ...payload },
    });

  it('returns an EVM build with the quote it embeds, built from that quote', async () => {
    mockExecuteQuote.mockImplementation(async () => {
      throw new EvmTransactionCaptured(EVM_BUILT);
    });

    const response = await swap({ chainNetwork: 'ethereum-base', connector: 'uniswap', walletAddress: EVM_WALLET });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    // Wei amounts stay decimal strings on the wire.
    expect({ ...body, quote: parseWire(JSON.stringify(body.quote)) }).toEqual({ ...EVM_BUILT, quote: QUOTE });
    expect(mockExecuteQuote).toHaveBeenCalledWith(EVM_WALLET, 'base', 'q-1');
  });

  it('still returns a Solana build with its quote', async () => {
    const solanaBuilt = {
      transaction: Buffer.from('unsigned-tx').toString('base64'),
      feePayer: '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5',
      recentBlockhash: 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N',
      lastValidBlockHeight: 2,
      currentBlockHeight: 1,
      extraSigners: [],
    };
    mockExecuteQuote.mockImplementation(async () => {
      throw new UnsignedTransactionCaptured(solanaBuilt);
    });

    const response = await swap({
      chainNetwork: 'solana-mainnet-beta',
      connector: 'jupiter',
      walletAddress: solanaBuilt.feePayer,
    });

    expect(response.statusCode).toBe(200);
    expect(parseWire(response.body)).toEqual({ ...solanaBuilt, quote: QUOTE });
  });

  it('refuses a platform fee on an EVM router before quoting', async () => {
    const response = await swap({
      chainNetwork: 'ethereum-base',
      connector: 'uniswap',
      walletAddress: EVM_WALLET,
      platformFee: { bps: 10, recipient: EVM_WALLET },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/platformFee applies to Solana builds only/);
    expect(mockQuoteSwap).not.toHaveBeenCalled();
  });
});
