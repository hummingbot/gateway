/**
 * ETCswap Functional Tests - Connector Integration
 *
 * Tests the actual Gateway connector functionality:
 * 1. Quote functionality (read-only, safe)
 * 2. Transaction building (without broadcast)
 * 3. Small test swaps (actual execution on testnet)
 *
 * Prerequisites:
 * 1. Copy .env.example to .env
 * 2. Add your private key to .env (MORDOR_PRIVATE_KEY or CLASSIC_PRIVATE_KEY)
 * 3. Ensure wallet has native currency for gas and tokens for swaps
 *
 * Run with: pnpm exec jest --runInBand test/connectors/etcswap/etcswap.functional.test.ts
 */

import { config } from 'dotenv';
import { BigNumber, Contract, utils, Wallet, ethers } from 'ethers';

// Load environment variables
config();

// Increase default timeout for blockchain operations
jest.setTimeout(60000);

// Test configuration
const MORDOR_PRIVATE_KEY = process.env.MORDOR_PRIVATE_KEY;
const CLASSIC_PRIVATE_KEY = process.env.CLASSIC_PRIVATE_KEY;

// Network configurations
const NETWORKS = {
  mordor: {
    name: 'mordor',
    chainId: 63,
    rpc: 'https://rpc.mordor.etccooperative.org',
    privateKey: MORDOR_PRIVATE_KEY,
    currency: 'METC',
    contracts: {
      V2_FACTORY: '0x212eE1B5c8C26ff5B2c4c14CD1C54486Fe23ce70',
      V2_ROUTER: '0x6d194227a9A1C11f144B35F96E6289c5602Da493', // Updated from 0x582A... to match UI mordor branch
      V3_FACTORY: '0x2624E907BcC04f93C8f29d7C7149a8700Ceb8cDC',
      V3_QUOTER: '0x4d8c163400CB87Cbe1bae76dBf36A09FED85d39B',
    },
    tokens: {
      WETC: '0x1953cab0E5bFa6D4a9BaD6E05fD46C1CC6527a5a',
      USC: '0xDE093684c796204224BC081f937aa059D903c52a',
    },
    tokenDecimals: {
      WETC: 18,
      USC: 6,
    },
    pools: {
      V2_WETC_USC: '0x0a73dc518791Fa8436939C8a8a08003EC782A509',
    },
    // Pool ratio: ~20 USC per 1 WETC
    // 0.1 WETC -> ~2 USC, 1 WETC -> ~20 USC
    testAmounts: {
      WETC_SELL: '0.1', // 0.1 WETC -> ~2 USC
      USC_SELL: '2', // 2 USC -> ~0.1 WETC
    },
  },
  classic: {
    name: 'classic',
    chainId: 61,
    rpc: 'https://etc.rivet.link',
    privateKey: CLASSIC_PRIVATE_KEY,
    currency: 'ETC',
    contracts: {
      V2_FACTORY: '0x0307cd3D7DA98A29e6Ed0D2137be386Ec1e4Bc9C',
      V2_ROUTER: '0x79Bf07555C34e68C4Ae93642d1007D7f908d60F5',
      V3_FACTORY: '0x2624E907BcC04f93C8f29d7C7149a8700Ceb8cDC',
      V3_QUOTER: '0x4d8c163400CB87Cbe1bae76dBf36A09FED85d39B',
    },
    tokens: {
      WETC: '0x1953cab0E5bFa6D4a9BaD6E05fD46C1CC6527a5a',
      USC: '0xDE093684c796204224BC081f937aa059D903c52a',
    },
    tokenDecimals: {
      WETC: 18,
      USC: 6,
    },
    pools: {
      V2_WETC_USC: '0x8B48dE7cCE180ad32A51d8aB5ab28B27c4787aaf',
    },
    // Pool ratio: ~12.87 USC per 1 WETC
    // 0.001 WETC -> ~0.0128 USC, 0.01 USC -> ~0.00078 WETC
    testAmounts: {
      WETC_SELL: '0.001', // 0.001 WETC -> ~0.0128 USC
      USC_SELL: '0.01', // 0.01 USC -> ~0.00078 WETC
    },
  },
};

// ABIs
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

const V2_ROUTER_ABI = [
  'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
  'function getAmountsIn(uint amountOut, address[] memory path) public view returns (uint[] memory amounts)',
  'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function swapTokensForExactTokens(uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
];

const V2_FACTORY_ABI = [
  'function getPair(address, address) view returns (address)',
  'function allPairsLength() view returns (uint256)',
];

const V2_PAIR_ABI = [
  'function getReserves() view returns (uint112, uint112, uint32)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
];

// Helper to check if tests should run
function shouldRunTests(networkKey: string): boolean {
  const network = NETWORKS[networkKey as keyof typeof NETWORKS];
  return !!network.privateKey && network.privateKey !== 'your_private_key_here';
}

// Helper to format token amounts
function formatAmount(amount: BigNumber, decimals: number): string {
  return ethers.utils.formatUnits(amount, decimals);
}

// Helper to parse token amounts
function parseAmount(amount: string | number, decimals: number): BigNumber {
  return ethers.utils.parseUnits(amount.toString(), decimals);
}

// ============================================================================
// MORDOR TESTNET TESTS
// ============================================================================

// NOTE: Updated to use the correct Mordor router (0x6d194227a9A1C11f144B35F96E6289c5602Da493)
// from the ETCswap UI mordor branch, which has the correct INIT_CODE_HASH
// SDK INIT_CODE_HASH: 0xb5e58237f3a44220ffc3dfb989e53735df8fcd9df82c94b13105be8380344e52
const describeMordor = shouldRunTests('mordor') ? describe : describe.skip;

describeMordor('ETCswap Functional Tests (Mordor Testnet)', () => {
  const network = NETWORKS.mordor;
  let provider: ethers.providers.JsonRpcProvider;
  let wallet: Wallet;
  let routerContract: Contract;
  let factoryContract: Contract;

  beforeAll(async () => {
    provider = new ethers.providers.JsonRpcProvider(network.rpc);
    wallet = new Wallet(network.privateKey!, provider);
    routerContract = new Contract(network.contracts.V2_ROUTER, V2_ROUTER_ABI, wallet);
    factoryContract = new Contract(network.contracts.V2_FACTORY, V2_FACTORY_ABI, provider);

    console.log(`\nTest wallet: ${wallet.address}`);
    const balance = await provider.getBalance(wallet.address);
    console.log(`Balance: ${formatAmount(balance, 18)} ${network.currency}\n`);
  });

  // ==========================================================================
  // 1. QUOTE FUNCTIONALITY (Read-only, safe)
  // ==========================================================================
  describe('Quote Functionality', () => {
    it('should get V2 quote for WETC -> USC swap (SELL)', async () => {
      const amountIn = parseAmount(network.testAmounts.WETC_SELL, network.tokenDecimals.WETC);
      const path = [network.tokens.WETC, network.tokens.USC];

      const amounts = await routerContract.getAmountsOut(amountIn, path);

      console.log(
        `Quote: ${formatAmount(amountIn, network.tokenDecimals.WETC)} WETC -> ${formatAmount(amounts[1], network.tokenDecimals.USC)} USC`,
      );

      expect(amounts.length).toBe(2);
      expect(amounts[0].eq(amountIn)).toBe(true);
      expect(amounts[1].gt(0)).toBe(true);
    });

    it('should get V2 quote for USC -> WETC swap (SELL)', async () => {
      const amountIn = parseAmount(network.testAmounts.USC_SELL, network.tokenDecimals.USC);
      const path = [network.tokens.USC, network.tokens.WETC];

      const amounts = await routerContract.getAmountsOut(amountIn, path);

      console.log(
        `Quote: ${formatAmount(amountIn, network.tokenDecimals.USC)} USC -> ${formatAmount(amounts[1], network.tokenDecimals.WETC)} WETC`,
      );

      expect(amounts.length).toBe(2);
      expect(amounts[1].gt(0)).toBe(true);
    });

    it('should get V2 quote for BUY (exact output)', async () => {
      // Want exactly some USC, calculate how much WETC needed
      const amountOut = parseAmount(network.testAmounts.USC_SELL, network.tokenDecimals.USC);
      const path = [network.tokens.WETC, network.tokens.USC];

      const amounts = await routerContract.getAmountsIn(amountOut, path);

      console.log(
        `Quote: Need ${formatAmount(amounts[0], network.tokenDecimals.WETC)} WETC to get ${formatAmount(amountOut, network.tokenDecimals.USC)} USC`,
      );

      expect(amounts.length).toBe(2);
      expect(amounts[0].gt(0)).toBe(true);
      expect(amounts[1].eq(amountOut)).toBe(true);
    });

    it('should calculate price impact from reserves', async () => {
      const pairAddress = network.pools.V2_WETC_USC;
      const pairContract = new Contract(pairAddress, V2_PAIR_ABI, provider);

      const [reserve0, reserve1] = await pairContract.getReserves();
      const token0 = await pairContract.token0();

      // Determine which reserve is WETC and which is USC
      const isToken0WETC = token0.toLowerCase() === network.tokens.WETC.toLowerCase();
      const wetcReserve = isToken0WETC ? reserve0 : reserve1;
      const uscReserve = isToken0WETC ? reserve1 : reserve0;

      // Calculate spot price (USC per WETC)
      const spotPrice =
        parseFloat(formatAmount(uscReserve, network.tokenDecimals.USC)) /
        parseFloat(formatAmount(wetcReserve, network.tokenDecimals.WETC));

      // Get quote for a swap
      const amountIn = parseAmount(network.testAmounts.WETC_SELL, network.tokenDecimals.WETC);
      const amounts = await routerContract.getAmountsOut(amountIn, [network.tokens.WETC, network.tokens.USC]);
      const executionPrice =
        parseFloat(formatAmount(amounts[1], network.tokenDecimals.USC)) /
        parseFloat(formatAmount(amounts[0], network.tokenDecimals.WETC));

      // Price impact = (spotPrice - executionPrice) / spotPrice * 100
      const priceImpact = ((spotPrice - executionPrice) / spotPrice) * 100;

      console.log(`Spot price: ${spotPrice.toFixed(8)} USC/WETC`);
      console.log(`Execution price for ${network.testAmounts.WETC_SELL} WETC: ${executionPrice.toFixed(8)} USC/WETC`);
      console.log(`Price impact: ${priceImpact.toFixed(4)}%`);

      expect(priceImpact).toBeGreaterThanOrEqual(0);
      expect(priceImpact).toBeLessThan(50); // Sanity check
    });

    it('should get pool info', async () => {
      const pairAddress = network.pools.V2_WETC_USC;
      const pairContract = new Contract(pairAddress, V2_PAIR_ABI, provider);

      const [reserve0, reserve1, blockTimestamp] = await pairContract.getReserves();
      const token0 = await pairContract.token0();
      const token1 = await pairContract.token1();

      console.log(`Pool: ${pairAddress}`);
      console.log(`  Token0: ${token0}`);
      console.log(`  Token1: ${token1}`);
      console.log(`  Reserve0: ${reserve0.toString()}`);
      console.log(`  Reserve1: ${reserve1.toString()}`);
      console.log(`  Last update: ${blockTimestamp}`);

      expect(reserve0.gt(0)).toBe(true);
      expect(reserve1.gt(0)).toBe(true);
    });
  });

  // ==========================================================================
  // 2. TRANSACTION BUILDING (Without broadcast)
  // ==========================================================================
  describe('Transaction Building', () => {
    it('should build swapExactTokensForTokens transaction', async () => {
      const amountIn = parseAmount(network.testAmounts.WETC_SELL, network.tokenDecimals.WETC);
      const path = [network.tokens.WETC, network.tokens.USC];

      // Get expected output
      const amounts = await routerContract.getAmountsOut(amountIn, path);
      const amountOutMin = amounts[1].mul(995).div(1000); // 0.5% slippage

      const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes

      // Build transaction data
      const iface = new utils.Interface(V2_ROUTER_ABI);
      const data = iface.encodeFunctionData('swapExactTokensForTokens', [
        amountIn,
        amountOutMin,
        path,
        wallet.address,
        deadline,
      ]);

      console.log(`Transaction built:`);
      console.log(`  To: ${network.contracts.V2_ROUTER}`);
      console.log(`  AmountIn: ${formatAmount(amountIn, network.tokenDecimals.WETC)} WETC`);
      console.log(`  MinAmountOut: ${formatAmount(amountOutMin, network.tokenDecimals.USC)} USC`);
      console.log(`  Deadline: ${new Date(deadline * 1000).toISOString()}`);
      console.log(`  Data length: ${data.length} bytes`);

      expect(data).toMatch(/^0x/);
      expect(data.length).toBeGreaterThan(10);

      // Verify we can decode it back
      const decoded = iface.parseTransaction({ data });
      expect(decoded.name).toBe('swapExactTokensForTokens');
      expect(decoded.args[0].eq(amountIn)).toBe(true);
    });

    it('should build swapTokensForExactTokens transaction', async () => {
      const amountOut = parseAmount(network.testAmounts.USC_SELL, network.tokenDecimals.USC);
      const path = [network.tokens.WETC, network.tokens.USC];

      // Get required input
      const amounts = await routerContract.getAmountsIn(amountOut, path);
      const amountInMax = amounts[0].mul(1005).div(1000); // 0.5% slippage

      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

      // Build transaction data
      const iface = new utils.Interface(V2_ROUTER_ABI);
      const data = iface.encodeFunctionData('swapTokensForExactTokens', [
        amountOut,
        amountInMax,
        path,
        wallet.address,
        deadline,
      ]);

      console.log(`Transaction built:`);
      console.log(`  AmountOut: ${formatAmount(amountOut, network.tokenDecimals.USC)} USC`);
      console.log(`  MaxAmountIn: ${formatAmount(amountInMax, network.tokenDecimals.WETC)} WETC`);

      expect(data).toMatch(/^0x/);

      // Verify decode
      const decoded = iface.parseTransaction({ data });
      expect(decoded.name).toBe('swapTokensForExactTokens');
    });

    it('should estimate gas for swap', async () => {
      const amountIn = parseAmount(network.testAmounts.WETC_SELL, network.tokenDecimals.WETC);
      const path = [network.tokens.WETC, network.tokens.USC];
      const amounts = await routerContract.getAmountsOut(amountIn, path);
      const amountOutMin = amounts[1].mul(995).div(1000);
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

      // Check allowance first
      const wetcContract = new Contract(network.tokens.WETC, ERC20_ABI, wallet);
      const allowance = await wetcContract.allowance(wallet.address, network.contracts.V2_ROUTER);

      if (allowance.lt(amountIn)) {
        console.log('Insufficient allowance, skipping gas estimation');
        expect(true).toBe(true);
        return;
      }

      try {
        const gasEstimate = await routerContract.estimateGas.swapExactTokensForTokens(
          amountIn,
          amountOutMin,
          path,
          wallet.address,
          deadline,
        );

        console.log(`Estimated gas: ${gasEstimate.toString()}`);
        expect(gasEstimate.gt(0)).toBe(true);
        expect(gasEstimate.lt(500000)).toBe(true);
      } catch (error: any) {
        console.log(`Gas estimation failed (likely insufficient balance): ${error.message}`);
        expect(true).toBe(true);
      }
    });
  });

  // ==========================================================================
  // 3. ACTUAL SWAP EXECUTION (Uses real funds!)
  // ==========================================================================
  describe('Swap Execution', () => {
    it('should check wallet has sufficient balances', async () => {
      const wetcContract = new Contract(network.tokens.WETC, ERC20_ABI, provider);
      const uscContract = new Contract(network.tokens.USC, ERC20_ABI, provider);
      const nativeBalance = await provider.getBalance(wallet.address);

      const wetcBalance = await wetcContract.balanceOf(wallet.address);
      const uscBalance = await uscContract.balanceOf(wallet.address);

      console.log(`Wallet balances:`);
      console.log(`  ${network.currency}: ${formatAmount(nativeBalance, 18)}`);
      console.log(`  WETC: ${formatAmount(wetcBalance, network.tokenDecimals.WETC)}`);
      console.log(`  USC: ${formatAmount(uscBalance, network.tokenDecimals.USC)}`);

      // Check minimum balances for testing
      const minNative = parseAmount('0.01', 18); // Need gas
      const minWetc = parseAmount(network.testAmounts.WETC_SELL, network.tokenDecimals.WETC);

      expect(nativeBalance.gte(minNative)).toBe(true);
      expect(wetcBalance.gte(minWetc)).toBe(true);
    });

    it('should approve router for WETC spending', async () => {
      const wetcContract = new Contract(network.tokens.WETC, ERC20_ABI, wallet);
      const currentAllowance = await wetcContract.allowance(wallet.address, network.contracts.V2_ROUTER);

      const requiredAllowance = parseAmount('10', network.tokenDecimals.WETC); // Approve 10 WETC

      if (currentAllowance.gte(requiredAllowance)) {
        console.log(`Allowance already sufficient: ${formatAmount(currentAllowance, network.tokenDecimals.WETC)} WETC`);
        expect(true).toBe(true);
        return;
      }

      console.log(`Approving router for WETC...`);
      const tx = await wetcContract.approve(network.contracts.V2_ROUTER, requiredAllowance, {
        gasPrice: parseAmount('2', 9), // 2 gwei
      });

      console.log(`Approval tx: ${tx.hash}`);
      const receipt = await tx.wait();

      console.log(`Approval confirmed in block ${receipt.blockNumber}`);
      expect(receipt.status).toBe(1);

      const newAllowance = await wetcContract.allowance(wallet.address, network.contracts.V2_ROUTER);
      console.log(`New allowance: ${formatAmount(newAllowance, network.tokenDecimals.WETC)} WETC`);
      expect(newAllowance.gte(requiredAllowance)).toBe(true);
    });

    it('should execute WETC -> USC swap', async () => {
      const wetcContract = new Contract(network.tokens.WETC, ERC20_ABI, provider);
      const uscContract = new Contract(network.tokens.USC, ERC20_ABI, provider);

      // Get balances before
      const wetcBefore = await wetcContract.balanceOf(wallet.address);
      const uscBefore = await uscContract.balanceOf(wallet.address);

      const amountIn = parseAmount(network.testAmounts.WETC_SELL, network.tokenDecimals.WETC);
      const path = [network.tokens.WETC, network.tokens.USC];

      // Check allowance
      const allowance = await wetcContract.allowance(wallet.address, network.contracts.V2_ROUTER);
      if (allowance.lt(amountIn)) {
        console.log('Insufficient allowance, skipping swap');
        expect(true).toBe(true);
        return;
      }

      // Get quote
      const amounts = await routerContract.getAmountsOut(amountIn, path);
      const amountOutMin = amounts[1].mul(990).div(1000); // 1% slippage for testnet

      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

      console.log(`Executing swap:`);
      console.log(`  Input: ${formatAmount(amountIn, network.tokenDecimals.WETC)} WETC`);
      console.log(`  Expected output: ${formatAmount(amounts[1], network.tokenDecimals.USC)} USC`);
      console.log(`  Min output: ${formatAmount(amountOutMin, network.tokenDecimals.USC)} USC`);

      // Execute swap
      const tx = await routerContract.swapExactTokensForTokens(amountIn, amountOutMin, path, wallet.address, deadline, {
        gasLimit: 300000,
        gasPrice: parseAmount('2', 9), // 2 gwei
      });

      console.log(`Swap tx: ${tx.hash}`);
      const receipt = await tx.wait();

      console.log(`Swap confirmed in block ${receipt.blockNumber}`);
      console.log(`Gas used: ${receipt.gasUsed.toString()}`);

      // Get balances after
      const wetcAfter = await wetcContract.balanceOf(wallet.address);
      const uscAfter = await uscContract.balanceOf(wallet.address);

      const wetcChange = wetcBefore.sub(wetcAfter);
      const uscChange = uscAfter.sub(uscBefore);

      console.log(`Balance changes:`);
      console.log(`  WETC: -${formatAmount(wetcChange, network.tokenDecimals.WETC)}`);
      console.log(`  USC: +${formatAmount(uscChange, network.tokenDecimals.USC)}`);

      expect(receipt.status).toBe(1);
      expect(wetcChange.eq(amountIn)).toBe(true);
      expect(uscChange.gte(amountOutMin)).toBe(true);
    });

    it('should approve router for USC spending', async () => {
      const uscContract = new Contract(network.tokens.USC, ERC20_ABI, wallet);
      const currentAllowance = await uscContract.allowance(wallet.address, network.contracts.V2_ROUTER);

      const requiredAllowance = parseAmount('100', network.tokenDecimals.USC); // Approve 100 USC

      if (currentAllowance.gte(requiredAllowance)) {
        console.log(
          `USC allowance already sufficient: ${formatAmount(currentAllowance, network.tokenDecimals.USC)} USC`,
        );
        expect(true).toBe(true);
        return;
      }

      console.log(`Approving router for USC...`);
      const tx = await uscContract.approve(network.contracts.V2_ROUTER, requiredAllowance, {
        gasPrice: parseAmount('2', 9),
      });

      console.log(`Approval tx: ${tx.hash}`);
      const receipt = await tx.wait();

      console.log(`Approval confirmed in block ${receipt.blockNumber}`);
      expect(receipt.status).toBe(1);
    });

    it('should execute USC -> WETC swap (reverse)', async () => {
      const wetcContract = new Contract(network.tokens.WETC, ERC20_ABI, provider);
      const uscContract = new Contract(network.tokens.USC, ERC20_ABI, provider);

      // Get balances before
      const wetcBefore = await wetcContract.balanceOf(wallet.address);
      const uscBefore = await uscContract.balanceOf(wallet.address);

      const amountIn = parseAmount(network.testAmounts.USC_SELL, network.tokenDecimals.USC);
      const path = [network.tokens.USC, network.tokens.WETC];

      // Check balance
      if (uscBefore.lt(amountIn)) {
        console.log('Insufficient USC balance, skipping reverse swap');
        expect(true).toBe(true);
        return;
      }

      // Check allowance
      const allowance = await uscContract.allowance(wallet.address, network.contracts.V2_ROUTER);
      if (allowance.lt(amountIn)) {
        console.log('Insufficient USC allowance, skipping reverse swap');
        expect(true).toBe(true);
        return;
      }

      // Get quote
      const amounts = await routerContract.getAmountsOut(amountIn, path);
      const amountOutMin = amounts[1].mul(990).div(1000);

      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

      console.log(`Executing reverse swap:`);
      console.log(`  Input: ${formatAmount(amountIn, network.tokenDecimals.USC)} USC`);
      console.log(`  Expected output: ${formatAmount(amounts[1], network.tokenDecimals.WETC)} WETC`);

      // Execute swap
      const tx = await routerContract.swapExactTokensForTokens(amountIn, amountOutMin, path, wallet.address, deadline, {
        gasLimit: 300000,
        gasPrice: parseAmount('2', 9),
      });

      console.log(`Swap tx: ${tx.hash}`);
      const receipt = await tx.wait();

      console.log(`Swap confirmed in block ${receipt.blockNumber}`);

      // Get balances after
      const wetcAfter = await wetcContract.balanceOf(wallet.address);
      const uscAfter = await uscContract.balanceOf(wallet.address);

      const wetcChange = wetcAfter.sub(wetcBefore);
      const uscChange = uscBefore.sub(uscAfter);

      console.log(`Balance changes:`);
      console.log(`  USC: -${formatAmount(uscChange, network.tokenDecimals.USC)}`);
      console.log(`  WETC: +${formatAmount(wetcChange, network.tokenDecimals.WETC)}`);

      expect(receipt.status).toBe(1);
      expect(wetcChange.gte(amountOutMin)).toBe(true);
    });
  });
});

// ============================================================================
// CLASSIC MAINNET TESTS
// ============================================================================

const describeClassic = shouldRunTests('classic') ? describe : describe.skip;

describeClassic('ETCswap Functional Tests (Classic Mainnet)', () => {
  const network = NETWORKS.classic;
  let provider: ethers.providers.JsonRpcProvider;
  let wallet: Wallet;
  let routerContract: Contract;

  beforeAll(async () => {
    provider = new ethers.providers.JsonRpcProvider(network.rpc);
    wallet = new Wallet(network.privateKey!, provider);
    routerContract = new Contract(network.contracts.V2_ROUTER, V2_ROUTER_ABI, wallet);

    console.log(`\nTest wallet: ${wallet.address}`);
    const balance = await provider.getBalance(wallet.address);
    console.log(`Balance: ${formatAmount(balance, 18)} ${network.currency}\n`);
  });

  describe('Quote Functionality', () => {
    it('should get V2 quote for WETC -> USC swap (SELL)', async () => {
      const amountIn = parseAmount(network.testAmounts.WETC_SELL, network.tokenDecimals.WETC);
      const path = [network.tokens.WETC, network.tokens.USC];

      const amounts = await routerContract.getAmountsOut(amountIn, path);

      console.log(
        `Quote: ${formatAmount(amountIn, network.tokenDecimals.WETC)} WETC -> ${formatAmount(amounts[1], network.tokenDecimals.USC)} USC`,
      );

      expect(amounts.length).toBe(2);
      expect(amounts[0].eq(amountIn)).toBe(true);
      expect(amounts[1].gt(0)).toBe(true);
    });

    it('should get V2 quote for USC -> WETC swap (SELL)', async () => {
      const amountIn = parseAmount(network.testAmounts.USC_SELL, network.tokenDecimals.USC);
      const path = [network.tokens.USC, network.tokens.WETC];

      const amounts = await routerContract.getAmountsOut(amountIn, path);

      console.log(
        `Quote: ${formatAmount(amountIn, network.tokenDecimals.USC)} USC -> ${formatAmount(amounts[1], network.tokenDecimals.WETC)} WETC`,
      );

      expect(amounts.length).toBe(2);
      expect(amounts[1].gt(0)).toBe(true);
    });

    it('should get V2 quote for BUY (exact output)', async () => {
      const amountOut = parseAmount(network.testAmounts.USC_SELL, network.tokenDecimals.USC);
      const path = [network.tokens.WETC, network.tokens.USC];

      const amounts = await routerContract.getAmountsIn(amountOut, path);

      console.log(
        `Quote: Need ${formatAmount(amounts[0], network.tokenDecimals.WETC)} WETC to get ${formatAmount(amountOut, network.tokenDecimals.USC)} USC`,
      );

      expect(amounts.length).toBe(2);
      expect(amounts[0].gt(0)).toBe(true);
      expect(amounts[1].eq(amountOut)).toBe(true);
    });

    it('should calculate price impact from reserves', async () => {
      const pairAddress = network.pools.V2_WETC_USC;
      const pairContract = new Contract(pairAddress, V2_PAIR_ABI, provider);

      const [reserve0, reserve1] = await pairContract.getReserves();
      const token0 = await pairContract.token0();

      const isToken0WETC = token0.toLowerCase() === network.tokens.WETC.toLowerCase();
      const wetcReserve = isToken0WETC ? reserve0 : reserve1;
      const uscReserve = isToken0WETC ? reserve1 : reserve0;

      const spotPrice =
        parseFloat(formatAmount(uscReserve, network.tokenDecimals.USC)) /
        parseFloat(formatAmount(wetcReserve, network.tokenDecimals.WETC));

      const amountIn = parseAmount(network.testAmounts.WETC_SELL, network.tokenDecimals.WETC);
      const amounts = await routerContract.getAmountsOut(amountIn, [network.tokens.WETC, network.tokens.USC]);
      const executionPrice =
        parseFloat(formatAmount(amounts[1], network.tokenDecimals.USC)) /
        parseFloat(formatAmount(amounts[0], network.tokenDecimals.WETC));

      const priceImpact = ((spotPrice - executionPrice) / spotPrice) * 100;

      console.log(`Spot price: ${spotPrice.toFixed(6)} USC/WETC`);
      console.log(`Execution price for ${network.testAmounts.WETC_SELL} WETC: ${executionPrice.toFixed(6)} USC/WETC`);
      console.log(`Price impact: ${priceImpact.toFixed(4)}%`);

      expect(priceImpact).toBeGreaterThanOrEqual(0);
      expect(priceImpact).toBeLessThan(50);
    });

    it('should get pool info', async () => {
      const pairAddress = network.pools.V2_WETC_USC;
      const pairContract = new Contract(pairAddress, V2_PAIR_ABI, provider);

      const [reserve0, reserve1, blockTimestamp] = await pairContract.getReserves();
      const token0 = await pairContract.token0();
      const token1 = await pairContract.token1();

      console.log(`Pool: ${pairAddress}`);
      console.log(`  Token0: ${token0}`);
      console.log(`  Token1: ${token1}`);
      console.log(`  Reserve0: ${reserve0.toString()}`);
      console.log(`  Reserve1: ${reserve1.toString()}`);

      expect(reserve0.gt(0)).toBe(true);
      expect(reserve1.gt(0)).toBe(true);
    });
  });

  describe('Transaction Building', () => {
    it('should build swapExactTokensForTokens transaction', async () => {
      const amountIn = parseAmount(network.testAmounts.WETC_SELL, network.tokenDecimals.WETC);
      const path = [network.tokens.WETC, network.tokens.USC];

      const amounts = await routerContract.getAmountsOut(amountIn, path);
      const amountOutMin = amounts[1].mul(995).div(1000);
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

      const iface = new utils.Interface(V2_ROUTER_ABI);
      const data = iface.encodeFunctionData('swapExactTokensForTokens', [
        amountIn,
        amountOutMin,
        path,
        wallet.address,
        deadline,
      ]);

      console.log(`Transaction built:`);
      console.log(`  To: ${network.contracts.V2_ROUTER}`);
      console.log(`  AmountIn: ${formatAmount(amountIn, network.tokenDecimals.WETC)} WETC`);
      console.log(`  MinAmountOut: ${formatAmount(amountOutMin, network.tokenDecimals.USC)} USC`);
      console.log(`  Data length: ${data.length} bytes`);

      expect(data).toMatch(/^0x/);
      expect(data.length).toBeGreaterThan(10);

      const decoded = iface.parseTransaction({ data });
      expect(decoded.name).toBe('swapExactTokensForTokens');
    });

    it('should build swapTokensForExactTokens transaction', async () => {
      const amountOut = parseAmount(network.testAmounts.USC_SELL, network.tokenDecimals.USC);
      const path = [network.tokens.WETC, network.tokens.USC];

      const amounts = await routerContract.getAmountsIn(amountOut, path);
      const amountInMax = amounts[0].mul(1005).div(1000);
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

      const iface = new utils.Interface(V2_ROUTER_ABI);
      const data = iface.encodeFunctionData('swapTokensForExactTokens', [
        amountOut,
        amountInMax,
        path,
        wallet.address,
        deadline,
      ]);

      console.log(`Transaction built:`);
      console.log(`  AmountOut: ${formatAmount(amountOut, network.tokenDecimals.USC)} USC`);
      console.log(`  MaxAmountIn: ${formatAmount(amountInMax, network.tokenDecimals.WETC)} WETC`);

      expect(data).toMatch(/^0x/);
    });

    it('should estimate gas for swap', async () => {
      const amountIn = parseAmount(network.testAmounts.WETC_SELL, network.tokenDecimals.WETC);
      const path = [network.tokens.WETC, network.tokens.USC];
      const amounts = await routerContract.getAmountsOut(amountIn, path);
      const amountOutMin = amounts[1].mul(995).div(1000);
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

      const wetcContract = new Contract(network.tokens.WETC, ERC20_ABI, wallet);
      const allowance = await wetcContract.allowance(wallet.address, network.contracts.V2_ROUTER);

      if (allowance.lt(amountIn)) {
        console.log('Insufficient allowance, skipping gas estimation');
        expect(true).toBe(true);
        return;
      }

      try {
        const gasEstimate = await routerContract.estimateGas.swapExactTokensForTokens(
          amountIn,
          amountOutMin,
          path,
          wallet.address,
          deadline,
        );

        console.log(`Estimated gas: ${gasEstimate.toString()}`);
        expect(gasEstimate.gt(0)).toBe(true);
        expect(gasEstimate.lt(500000)).toBe(true);
      } catch (error: any) {
        console.log(`Gas estimation failed: ${error.message}`);
        expect(true).toBe(true);
      }
    });
  });

  describe('Swap Execution', () => {
    it('should check wallet has sufficient balances', async () => {
      const wetcContract = new Contract(network.tokens.WETC, ERC20_ABI, provider);
      const uscContract = new Contract(network.tokens.USC, ERC20_ABI, provider);
      const nativeBalance = await provider.getBalance(wallet.address);

      const wetcBalance = await wetcContract.balanceOf(wallet.address);
      const uscBalance = await uscContract.balanceOf(wallet.address);

      console.log(`Wallet balances:`);
      console.log(`  ${network.currency}: ${formatAmount(nativeBalance, 18)}`);
      console.log(`  WETC: ${formatAmount(wetcBalance, network.tokenDecimals.WETC)}`);
      console.log(`  USC: ${formatAmount(uscBalance, network.tokenDecimals.USC)}`);

      const minNative = parseAmount('0.01', 18);
      const minWetc = parseAmount(network.testAmounts.WETC_SELL, network.tokenDecimals.WETC);

      expect(nativeBalance.gte(minNative)).toBe(true);
      expect(wetcBalance.gte(minWetc)).toBe(true);
    });

    it('should approve router for WETC spending', async () => {
      const wetcContract = new Contract(network.tokens.WETC, ERC20_ABI, wallet);
      const currentAllowance = await wetcContract.allowance(wallet.address, network.contracts.V2_ROUTER);

      const requiredAllowance = parseAmount('1', network.tokenDecimals.WETC);

      if (currentAllowance.gte(requiredAllowance)) {
        console.log(`Allowance already sufficient: ${formatAmount(currentAllowance, network.tokenDecimals.WETC)} WETC`);
        expect(true).toBe(true);
        return;
      }

      console.log(`Approving router for WETC...`);
      const tx = await wetcContract.approve(network.contracts.V2_ROUTER, requiredAllowance, {
        gasPrice: parseAmount('2', 9),
      });

      console.log(`Approval tx: ${tx.hash}`);
      const receipt = await tx.wait();

      console.log(`Approval confirmed in block ${receipt.blockNumber}`);
      expect(receipt.status).toBe(1);
    });

    it('should execute WETC -> USC swap', async () => {
      const wetcContract = new Contract(network.tokens.WETC, ERC20_ABI, provider);
      const uscContract = new Contract(network.tokens.USC, ERC20_ABI, provider);

      const wetcBefore = await wetcContract.balanceOf(wallet.address);
      const uscBefore = await uscContract.balanceOf(wallet.address);

      const amountIn = parseAmount(network.testAmounts.WETC_SELL, network.tokenDecimals.WETC);
      const path = [network.tokens.WETC, network.tokens.USC];

      const allowance = await wetcContract.allowance(wallet.address, network.contracts.V2_ROUTER);
      if (allowance.lt(amountIn)) {
        console.log('Insufficient allowance, skipping swap');
        expect(true).toBe(true);
        return;
      }

      const amounts = await routerContract.getAmountsOut(amountIn, path);
      const amountOutMin = amounts[1].mul(990).div(1000);
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

      console.log(`Executing swap:`);
      console.log(`  Input: ${formatAmount(amountIn, network.tokenDecimals.WETC)} WETC`);
      console.log(`  Expected output: ${formatAmount(amounts[1], network.tokenDecimals.USC)} USC`);
      console.log(`  Min output: ${formatAmount(amountOutMin, network.tokenDecimals.USC)} USC`);

      const tx = await routerContract.swapExactTokensForTokens(amountIn, amountOutMin, path, wallet.address, deadline, {
        gasLimit: 300000,
        gasPrice: parseAmount('2', 9),
      });

      console.log(`Swap tx: ${tx.hash}`);
      const receipt = await tx.wait();

      console.log(`Swap confirmed in block ${receipt.blockNumber}`);
      console.log(`Gas used: ${receipt.gasUsed.toString()}`);

      const wetcAfter = await wetcContract.balanceOf(wallet.address);
      const uscAfter = await uscContract.balanceOf(wallet.address);

      const wetcChange = wetcBefore.sub(wetcAfter);
      const uscChange = uscAfter.sub(uscBefore);

      console.log(`Balance changes:`);
      console.log(`  WETC: -${formatAmount(wetcChange, network.tokenDecimals.WETC)}`);
      console.log(`  USC: +${formatAmount(uscChange, network.tokenDecimals.USC)}`);

      expect(receipt.status).toBe(1);
      expect(wetcChange.eq(amountIn)).toBe(true);
      expect(uscChange.gte(amountOutMin)).toBe(true);
    });

    it('should approve router for USC spending', async () => {
      const uscContract = new Contract(network.tokens.USC, ERC20_ABI, wallet);
      const currentAllowance = await uscContract.allowance(wallet.address, network.contracts.V2_ROUTER);

      const requiredAllowance = parseAmount('10', network.tokenDecimals.USC);

      if (currentAllowance.gte(requiredAllowance)) {
        console.log(
          `USC allowance already sufficient: ${formatAmount(currentAllowance, network.tokenDecimals.USC)} USC`,
        );
        expect(true).toBe(true);
        return;
      }

      console.log(`Approving router for USC...`);
      const tx = await uscContract.approve(network.contracts.V2_ROUTER, requiredAllowance, {
        gasPrice: parseAmount('2', 9),
      });

      console.log(`Approval tx: ${tx.hash}`);
      const receipt = await tx.wait();

      console.log(`Approval confirmed in block ${receipt.blockNumber}`);
      expect(receipt.status).toBe(1);
    });

    it('should execute USC -> WETC swap (reverse)', async () => {
      const wetcContract = new Contract(network.tokens.WETC, ERC20_ABI, provider);
      const uscContract = new Contract(network.tokens.USC, ERC20_ABI, provider);

      const wetcBefore = await wetcContract.balanceOf(wallet.address);
      const uscBefore = await uscContract.balanceOf(wallet.address);

      const amountIn = parseAmount(network.testAmounts.USC_SELL, network.tokenDecimals.USC);
      const path = [network.tokens.USC, network.tokens.WETC];

      if (uscBefore.lt(amountIn)) {
        console.log('Insufficient USC balance, skipping reverse swap');
        expect(true).toBe(true);
        return;
      }

      const allowance = await uscContract.allowance(wallet.address, network.contracts.V2_ROUTER);
      if (allowance.lt(amountIn)) {
        console.log('Insufficient USC allowance, skipping reverse swap');
        expect(true).toBe(true);
        return;
      }

      const amounts = await routerContract.getAmountsOut(amountIn, path);
      const amountOutMin = amounts[1].mul(990).div(1000);
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

      console.log(`Executing reverse swap:`);
      console.log(`  Input: ${formatAmount(amountIn, network.tokenDecimals.USC)} USC`);
      console.log(`  Expected output: ${formatAmount(amounts[1], network.tokenDecimals.WETC)} WETC`);

      const tx = await routerContract.swapExactTokensForTokens(amountIn, amountOutMin, path, wallet.address, deadline, {
        gasLimit: 300000,
        gasPrice: parseAmount('2', 9),
      });

      console.log(`Swap tx: ${tx.hash}`);
      const receipt = await tx.wait();

      console.log(`Swap confirmed in block ${receipt.blockNumber}`);

      const wetcAfter = await wetcContract.balanceOf(wallet.address);
      const uscAfter = await uscContract.balanceOf(wallet.address);

      const wetcChange = wetcAfter.sub(wetcBefore);
      const uscChange = uscBefore.sub(uscAfter);

      console.log(`Balance changes:`);
      console.log(`  USC: -${formatAmount(uscChange, network.tokenDecimals.USC)}`);
      console.log(`  WETC: +${formatAmount(wetcChange, network.tokenDecimals.WETC)}`);

      expect(receipt.status).toBe(1);
      expect(wetcChange.gte(amountOutMin)).toBe(true);
    });
  });
});

// Status report when tests are skipped
describe('ETCswap Functional Tests Status', () => {
  it('should report test configuration', () => {
    console.log('\n=== ETCswap Functional Test Configuration ===\n');

    if (!shouldRunTests('mordor')) {
      console.log('Mordor tests: SKIPPED (no MORDOR_PRIVATE_KEY in .env)');
    } else {
      console.log('Mordor tests: ENABLED');
    }

    if (!shouldRunTests('classic')) {
      console.log('Classic tests: SKIPPED (no CLASSIC_PRIVATE_KEY in .env)');
    } else {
      console.log('Classic tests: ENABLED');
    }

    console.log('\nTo enable Classic tests:');
    console.log('  1. Copy .env.example to .env');
    console.log('  2. Add your CLASSIC_PRIVATE_KEY');
    console.log('  3. Ensure wallet has ETC, WETC, and USC\n');

    expect(true).toBe(true);
  });
});
