/**
 * ETCswap Live Tests on Mordor Testnet
 *
 * These tests run against the actual Mordor testnet to verify
 * the ETCswap connector works correctly with real blockchain data.
 *
 * Prerequisites:
 * 1. Copy .env.example to .env
 * 2. Add your Mordor testnet private key to .env
 * 3. Ensure wallet has METC for gas (get from faucet.mordortest.net)
 *
 * Run with: GATEWAY_TEST_MODE=dev jest --runInBand test/connectors/etcswap/etcswap.live.test.ts
 */

import { config } from 'dotenv';
import { ethers } from 'ethers';

// Load environment variables
config();

// Skip all tests if no private key configured
const PRIVATE_KEY = process.env.MORDOR_PRIVATE_KEY;
const SKIP_LIVE_TESTS = !PRIVATE_KEY || PRIVATE_KEY === 'your_private_key_here';

// Mordor testnet configuration
const MORDOR_RPC = 'https://rpc.mordor.etccooperative.org';
const MORDOR_CHAIN_ID = 63;

// Zero address constant for ethers v5
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// ETCswap contract addresses on Mordor
const CONTRACTS = {
  V2_FACTORY: '0x212eE1B5c8C26ff5B2c4c14CD1C54486Fe23ce70',
  V2_ROUTER: '0x6d194227a9A1C11f144B35F96E6289c5602Da493', // Updated to match ETCswap UI mordor branch
  V3_FACTORY: '0x2624E907BcC04f93C8f29d7C7149a8700Ceb8cDC',
  V3_QUOTER: '0x4d8c163400CB87Cbe1bae76dBf36A09FED85d39B',
  UNIVERSAL_ROUTER: '0x9b676E761040D60C6939dcf5f582c2A4B51025F1',
  NFT_POSITION_MANAGER: '0x3CEDe6562D6626A04d7502CC35720901999AB699',
};

// Token addresses on Mordor
const TOKENS = {
  WETC: '0x1953cab0E5bFa6D4a9BaD6E05fD46C1CC6527a5a',
  USC: '0xDE093684c796204224BC081f937aa059D903c52a',
};

// Minimal ABIs for testing
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
];

const V2_FACTORY_ABI = [
  'function getPair(address, address) view returns (address)',
  'function allPairsLength() view returns (uint256)',
];

const V2_PAIR_ABI = [
  'function getReserves() view returns (uint112, uint112, uint32)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function totalSupply() view returns (uint256)',
];

const V3_FACTORY_ABI = ['function getPool(address, address, uint24) view returns (address)'];

const V3_POOL_ABI = [
  'function slot0() view returns (uint160, int24, uint16, uint16, uint16, uint8, bool)',
  'function liquidity() view returns (uint128)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function fee() view returns (uint24)',
];

const describeIfLive = SKIP_LIVE_TESTS ? describe.skip : describe;

describeIfLive('ETCswap Live Tests (Mordor Testnet)', () => {
  let provider: ethers.providers.JsonRpcProvider;
  let wallet: ethers.Wallet;

  beforeAll(() => {
    provider = new ethers.providers.JsonRpcProvider(MORDOR_RPC);
    if (PRIVATE_KEY) {
      wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    }
  });

  describe('Network Connectivity', () => {
    it('should connect to Mordor RPC', async () => {
      const network = await provider.getNetwork();
      expect(network.chainId).toBe(MORDOR_CHAIN_ID);
    });

    it('should get current block number', async () => {
      const blockNumber = await provider.getBlockNumber();
      expect(blockNumber).toBeGreaterThan(0);
    });

    it('should get wallet balance', async () => {
      const balance = await provider.getBalance(wallet.address);
      console.log(`Wallet ${wallet.address} balance: ${ethers.utils.formatEther(balance)} METC`);
      expect(balance).toBeDefined();
    });
  });

  describe('Token Contracts', () => {
    it('should read WETC token info', async () => {
      const wetc = new ethers.Contract(TOKENS.WETC, ERC20_ABI, provider);

      const [symbol, decimals, name] = await Promise.all([wetc.symbol(), wetc.decimals(), wetc.name()]);

      expect(symbol).toBe('WETC');
      expect(decimals).toBe(18);
      expect(name).toBeDefined();
    });

    it('should read USC token info', async () => {
      const usc = new ethers.Contract(TOKENS.USC, ERC20_ABI, provider);

      const [symbol, decimals] = await Promise.all([usc.symbol(), usc.decimals()]);

      expect(symbol).toBe('USC');
      expect(decimals).toBe(6);
    });

    it('should get wallet token balances', async () => {
      const wetc = new ethers.Contract(TOKENS.WETC, ERC20_ABI, provider);
      const usc = new ethers.Contract(TOKENS.USC, ERC20_ABI, provider);

      const [wetcBalance, uscBalance] = await Promise.all([
        wetc.balanceOf(wallet.address),
        usc.balanceOf(wallet.address),
      ]);

      console.log(`WETC balance: ${ethers.utils.formatUnits(wetcBalance, 18)}`);
      console.log(`USC balance: ${ethers.utils.formatUnits(uscBalance, 6)}`);

      expect(wetcBalance).toBeDefined();
      expect(uscBalance).toBeDefined();
    });
  });

  describe('V2 AMM Contracts', () => {
    it('should connect to V2 Factory', async () => {
      const factory = new ethers.Contract(CONTRACTS.V2_FACTORY, V2_FACTORY_ABI, provider);

      const pairsLength = await factory.allPairsLength();
      console.log(`V2 Factory has ${pairsLength.toString()} pairs`);

      expect(pairsLength.gte(0)).toBe(true);
    });

    it('should get WETC/USC V2 pair address', async () => {
      const factory = new ethers.Contract(CONTRACTS.V2_FACTORY, V2_FACTORY_ABI, provider);

      const pairAddress = await factory.getPair(TOKENS.WETC, TOKENS.USC);
      console.log(`WETC/USC V2 Pair: ${pairAddress}`);

      // Pair may or may not exist on testnet
      expect(pairAddress).toBeDefined();
    });

    it('should read V2 pair reserves if pair exists', async () => {
      const factory = new ethers.Contract(CONTRACTS.V2_FACTORY, V2_FACTORY_ABI, provider);
      const pairAddress = await factory.getPair(TOKENS.WETC, TOKENS.USC);

      if (pairAddress !== ZERO_ADDRESS) {
        const pair = new ethers.Contract(pairAddress, V2_PAIR_ABI, provider);

        const [reserve0, reserve1, timestamp] = await pair.getReserves();
        const token0 = await pair.token0();
        const token1 = await pair.token1();

        console.log(`V2 Pair Reserves:`);
        console.log(`  Token0 (${token0}): ${reserve0.toString()}`);
        console.log(`  Token1 (${token1}): ${reserve1.toString()}`);
        console.log(`  Last update: ${timestamp}`);

        expect(reserve0).toBeDefined();
        expect(reserve1).toBeDefined();
      } else {
        console.log('WETC/USC V2 pair does not exist on Mordor');
        expect(true).toBe(true);
      }
    });
  });

  describe('V3 CLMM Contracts', () => {
    it('should connect to V3 Factory', async () => {
      const factory = new ethers.Contract(CONTRACTS.V3_FACTORY, V3_FACTORY_ABI, provider);

      // Try common fee tiers: 0.05%, 0.3%, 1%
      const feeTiers = [500, 3000, 10000];
      let poolFound = false;

      for (const fee of feeTiers) {
        const poolAddress = await factory.getPool(TOKENS.WETC, TOKENS.USC, fee);
        if (poolAddress !== ZERO_ADDRESS) {
          console.log(`WETC/USC V3 Pool (${fee / 10000}% fee): ${poolAddress}`);
          poolFound = true;
        }
      }

      if (!poolFound) {
        console.log('No WETC/USC V3 pools found on Mordor');
      }

      expect(true).toBe(true);
    });

    it('should read V3 pool data if pool exists', async () => {
      const factory = new ethers.Contract(CONTRACTS.V3_FACTORY, V3_FACTORY_ABI, provider);

      // Check 0.3% fee tier (most common)
      const poolAddress = await factory.getPool(TOKENS.WETC, TOKENS.USC, 3000);

      if (poolAddress !== ZERO_ADDRESS) {
        const pool = new ethers.Contract(poolAddress, V3_POOL_ABI, provider);

        const [slot0, liquidity, token0, token1, fee] = await Promise.all([
          pool.slot0(),
          pool.liquidity(),
          pool.token0(),
          pool.token1(),
          pool.fee(),
        ]);

        console.log(`V3 Pool Info:`);
        console.log(`  sqrtPriceX96: ${slot0[0].toString()}`);
        console.log(`  tick: ${slot0[1]}`);
        console.log(`  liquidity: ${liquidity.toString()}`);
        console.log(`  fee: ${fee}`);

        expect(slot0).toBeDefined();
        expect(liquidity).toBeDefined();
      } else {
        console.log('WETC/USC V3 pool (0.3%) does not exist on Mordor');
        expect(true).toBe(true);
      }
    });

    it('should verify NFT Position Manager contract', async () => {
      const code = await provider.getCode(CONTRACTS.NFT_POSITION_MANAGER);
      expect(code).not.toBe('0x');
      expect(code.length).toBeGreaterThan(10);
    });
  });

  describe('Universal Router', () => {
    it('should verify Universal Router contract exists', async () => {
      const code = await provider.getCode(CONTRACTS.UNIVERSAL_ROUTER);
      expect(code).not.toBe('0x');
      expect(code.length).toBeGreaterThan(10);
    });
  });

  describe('Contract Verification', () => {
    it('should verify all V2 contracts exist', async () => {
      const contracts = [CONTRACTS.V2_FACTORY, CONTRACTS.V2_ROUTER];

      for (const address of contracts) {
        const code = await provider.getCode(address);
        expect(code).not.toBe('0x');
        console.log(`✓ V2 contract at ${address} verified`);
      }
    });

    it('should verify all V3 contracts exist', async () => {
      const contracts = [
        CONTRACTS.V3_FACTORY,
        CONTRACTS.V3_QUOTER,
        CONTRACTS.NFT_POSITION_MANAGER,
        CONTRACTS.UNIVERSAL_ROUTER,
      ];

      for (const address of contracts) {
        const code = await provider.getCode(address);
        expect(code).not.toBe('0x');
        console.log(`✓ V3 contract at ${address} verified`);
      }
    });
  });
});

// Additional test for when live tests are skipped
describe('ETCswap Live Tests Status', () => {
  it('should report live test configuration status', () => {
    if (SKIP_LIVE_TESTS) {
      console.log('\n⚠️  Live tests SKIPPED - No MORDOR_PRIVATE_KEY in .env');
      console.log('To enable live tests:');
      console.log('  1. Copy .env.example to .env');
      console.log('  2. Add your Mordor testnet private key');
      console.log('  3. Get METC from https://faucet.mordortest.net\n');
    } else {
      console.log('\n✓ Live tests ENABLED - Using Mordor testnet\n');
    }
    expect(true).toBe(true);
  });
});
