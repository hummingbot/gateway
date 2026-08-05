import { utils } from 'ethers';

import { Ethereum } from '../../../src/chains/ethereum/ethereum';
import { Fibrous } from '../../../src/connectors/fibrous/fibrous';
import { FibrousRouterABI } from '../../../src/connectors/fibrous/fibrous.abi';
import { createHttpClient } from '../../../src/services/http-client';
import {
  buildCalldataResponse,
  buildRouteResponse,
  FIBROUS_ROUTER_ADDRESS,
  mockUSDC,
  mockWETH,
} from '../../mocks/fibrous/route.mock';

jest.mock('../../../src/chains/ethereum/ethereum');
jest.mock('../../../src/services/http-client', () => ({
  ...jest.requireActual('../../../src/services/http-client'),
  createHttpClient: jest.fn(),
}));

const DESTINATION = '0x1234567890123456789012345678901234567890';

const mockClient = {
  get: jest.fn(),
  post: jest.fn(),
};

const getFibrous = async (network = 'base') => {
  // Reset the connector singleton so each test gets a fresh client
  (Fibrous as any).instances.clear();
  (createHttpClient as jest.Mock).mockReturnValue(mockClient);
  (Ethereum.getInstance as jest.Mock).mockResolvedValue({ chainId: 8453 });
  return Fibrous.getInstance(network);
};

describe('Fibrous connector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getRoute', () => {
    it('requests an exact-input route and returns it', async () => {
      const fibrous = await getFibrous();
      const route = buildRouteResponse('1000000000000000000', '1888000000');
      mockClient.get.mockResolvedValue({ data: route });

      const result = await fibrous.getRoute({
        tokenInAddress: mockWETH.address,
        tokenOutAddress: mockUSDC.address,
        amount: '1000000000000000000',
        slippagePct: 0.5,
      });

      expect(result.outputAmount).toBe('1888000000');
      expect(mockClient.get).toHaveBeenCalledWith('/route', {
        params: {
          amount: '1000000000000000000',
          tokenInAddress: mockWETH.address,
          tokenOutAddress: mockUSDC.address,
          slippage: 0.5,
        },
      });
    });

    it('throws a readable error when the API reports no route', async () => {
      const fibrous = await getFibrous();
      mockClient.get.mockResolvedValue({ data: { success: false, errorMessage: 'No result found' } });

      await expect(
        fibrous.getRoute({
          tokenInAddress: mockWETH.address,
          tokenOutAddress: mockUSDC.address,
          amount: '1',
        }),
      ).rejects.toThrow('Fibrous API Error: No result found');
    });
  });

  describe('buildSwapTransaction', () => {
    it('ABI-encodes the router swap call from the calldata response', async () => {
      const fibrous = await getFibrous();
      const calldata = buildCalldataResponse('1000000000000000000', '1888000000', '1878560000', DESTINATION);

      const tx = fibrous.buildSwapTransaction(calldata as any);

      expect(tx.to).toBe(utils.getAddress(FIBROUS_ROUTER_ADDRESS));
      expect(tx.value).toBe('0');

      // Decoding the calldata must reproduce the API's swap arguments
      const iface = new utils.Interface(FibrousRouterABI as any);
      const decoded = iface.decodeFunctionData('swap', tx.data);
      expect(decoded.route.token_in).toBe(utils.getAddress(mockWETH.address));
      expect(decoded.route.amount_in.toString()).toBe('1000000000000000000');
      expect(decoded.route.min_received.toString()).toBe('1878560000');
      expect(decoded.route.destination).toBe(utils.getAddress(DESTINATION));
      expect(decoded.swap_parameters).toHaveLength(1);
      expect(decoded.swap_parameters[0].protocol_id).toBe(63);
    });

    it('forwards the input amount as transaction value for native-coin swaps', async () => {
      const fibrous = await getFibrous();
      const calldata = buildCalldataResponse(
        '1000000000000000000',
        '1888000000',
        '1878560000',
        DESTINATION,
        '0x0000000000000000000000000000000000000000',
      );

      const tx = fibrous.buildSwapTransaction(calldata as any);

      expect(tx.value).toBe('1000000000000000000');
    });
  });

  describe('getPriceImpactPct', () => {
    it('compares the execution rate against a smaller reference trade', async () => {
      const fibrous = await getFibrous();
      // Executed: 100 WETH -> 188000 USDC (rate 1880)
      const executed = buildRouteResponse('100000000000000000000', '188000000000');
      // Reference: 1 WETH -> 1888 USDC (rate 1888), so impact is ~0.4237%
      mockClient.get.mockResolvedValue({ data: buildRouteResponse('1000000000000000000', '1888000000') });

      const impact = await fibrous.getPriceImpactPct(executed as any);

      expect(impact).toBeCloseTo(0.4237, 3);
    });

    it('returns 0 when the reference trade cannot be routed', async () => {
      const fibrous = await getFibrous();
      const executed = buildRouteResponse('100000000000000000000', '188000000000');
      mockClient.get.mockResolvedValue({ data: { success: false, errorMessage: 'No result found' } });

      await expect(fibrous.getPriceImpactPct(executed as any)).resolves.toBe(0);
    });

    it('returns 0 rather than a negative impact', async () => {
      const fibrous = await getFibrous();
      // Executed rate is better than the reference rate
      const executed = buildRouteResponse('100000000000000000000', '190000000000');
      mockClient.get.mockResolvedValue({ data: buildRouteResponse('1000000000000000000', '1888000000') });

      await expect(fibrous.getPriceImpactPct(executed as any)).resolves.toBe(0);
    });
  });

  describe('getGasEstimate', () => {
    it('ignores the API gas field, which is not denominated in gas units', async () => {
      const fibrous = await getFibrous();
      // HyperEVM and Monad report a fee in native wei here, not a gas unit count
      const route = { ...buildRouteResponse('1', '1'), estimatedGasUsed: '169452577555850000' };

      expect(fibrous.getGasEstimate(route as any)).toBe('500000');
    });
  });

  describe('amount conversion', () => {
    it('round-trips between decimal and smallest-unit amounts', async () => {
      const fibrous = await getFibrous();

      expect(fibrous.parseTokenAmount(1.5, 18)).toBe('1500000000000000000');
      expect(fibrous.parseTokenAmount(150, 6)).toBe('150000000');
      expect(fibrous.formatTokenAmount('1500000000000000000', 18)).toBe('1.5');
      expect(fibrous.formatTokenAmount('150000000', 6)).toBe('150.0');
    });
  });
});
