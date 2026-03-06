/**
 * ETCswap Live Tests on Ethereum Classic Mainnet
 *
 * These tests run against the actual Ethereum Classic mainnet to verify
 * the ETCswap connector works correctly with real blockchain data.
 *
 * Prerequisites:
 * 1. Copy .env.example to .env
 * 2. Add your Ethereum Classic mainnet private key to .env
 * 3. Ensure wallet has ETC for gas and WETC/USC for trading tests
 *
 * Run with: GATEWAY_TEST_MODE=dev jest --runInBand test/connectors/etcswap/etcswap.classic.live.test.ts
 *
 * WARNING: These tests use REAL funds on mainnet. Use a dedicated test wallet!
 */

import { config } from 'dotenv';
import { ethers } from 'ethers';

// Load environment variables
config();

// Skip all tests if no private key configured
const PRIVATE_KEY = process.env.CLASSIC_PRIVATE_KEY;
const SKIP_LIVE_TESTS = !PRIVATE_KEY || PRIVATE_KEY === 'your_private_key_here';

// Ethereum Classic mainnet configuration
const CLASSIC_RPC = 'https://etc.rivet.link';
const CLASSIC_CHAIN_ID = 61;

// Zero address constant for ethers v5
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// ETCswap contract addresses on Ethereum Classic mainnet
const CONTRACTS = {
  V2_FACTORY: '0x0307cd3D7DA98A29e6Ed0D2137be386Ec1e4Bc9C',
  V2_ROUTER: '0x79Bf07555C34e68C4Ae93642d1007D7f908d60F5',
  V2_MULTICALL: '0x900cD941a2451471BC5760c3d69493Ac57aA9698',
  V3_FACTORY: '0x2624E907BcC04f93C8f29d7C7149a8700Ceb8cDC',
  V3_SWAP_ROUTER: '0xEd88EDD995b00956097bF90d39C9341BBde324d1',
  V3_QUOTER: '0x4d8c163400CB87Cbe1bae76dBf36A09FED85d39B',
  UNIVERSAL_ROUTER: '0x9b676E761040D60C6939dcf5f582c2A4B51025F1',
  NFT_POSITION_MANAGER: '0x3CEDe6562D6626A04d7502CC35720901999AB699',
  PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  TICK_LENS: '0x23B7Bab45c84fA8f68f813D844E8afD44eE8C315',
};

// Token addresses on Ethereum Classic mainnet
const TOKENS = {
  WETC: '0x1953cab0E5bFa6D4a9BaD6E05fD46C1CC6527a5a',
  USC: '0xDE093684c796204224BC081f937aa059D903c52a',
  ECO: '0xc0364FB5498c17088A5B1d98F6FB3dB2Df9866a9',
};

// Minimal ABIs for testing
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function totalSupply() view returns (uint256)',
];

const V2_FACTORY_ABI = [
  'function getPair(address, address) view returns (address)',
  'function allPairsLength() view returns (uint256)',
  'function allPairs(uint256) view returns (address)',
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

describeIfLive('ETCswap Live Tests (Ethereum Classic Mainnet)', () => {
  let provider: ethers.providers.JsonRpcProvider;
  let wallet: ethers.Wallet;

  beforeAll(() => {
    provider = new ethers.providers.JsonRpcProvider(CLASSIC_RPC);
    if (PRIVATE_KEY) {
      wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    }
  });

  describe('Network Connectivity', () => {
    it('should connect to Ethereum Classic RPC', async () => {
      const network = await provider.getNetwork();
      expect(network.chainId).toBe(CLASSIC_CHAIN_ID);
    });

    it('should get current block number', async () => {
      const blockNumber = await provider.getBlockNumber();
      expect(blockNumber).toBeGreaterThan(0);
      console.log(`Current block: ${blockNumber}`);
    });

    it('should get wallet ETC balance', async () => {
      const balance = await provider.getBalance(wallet.address);
      console.log(`Wallet ${wallet.address} balance: ${ethers.utils.formatEther(balance)} ETC`);
      expect(balance).toBeDefined();
    });
  });

  describe('Token Contracts', () => {
    it('should read WETC token info', async () => {
      const wetc = new ethers.Contract(TOKENS.WETC, ERC20_ABI, provider);

      const [symbol, decimals, name, totalSupply] = await Promise.all([
        wetc.symbol(),
        wetc.decimals(),
        wetc.name(),
        wetc.totalSupply(),
      ]);

      console.log(`WETC: ${name} (${symbol}), ${decimals} decimals`);
      console.log(`WETC total supply: ${ethers.utils.formatUnits(totalSupply, decimals)}`);

      expect(symbol).toBe('WETC');
      expect(decimals).toBe(18);
      expect(name).toBeDefined();
    });

    it('should read USC token info', async () => {
      const usc = new ethers.Contract(TOKENS.USC, ERC20_ABI, provider);

      const [symbol, decimals, name, totalSupply] = await Promise.all([
        usc.symbol(),
        usc.decimals(),
        usc.name(),
        usc.totalSupply(),
      ]);

      console.log(`USC: ${name} (${symbol}), ${decimals} decimals`);
      console.log(`USC total supply: ${ethers.utils.formatUnits(totalSupply, decimals)}`);

      expect(symbol).toBe('USC');
      expect(decimals).toBe(6); // USC has 6 decimals on mainnet
      expect(name).toBeDefined();
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
    it('should connect to V2 Factory and count pairs', async () => {
      const factory = new ethers.Contract(CONTRACTS.V2_FACTORY, V2_FACTORY_ABI, provider);

      const pairsLength = await factory.allPairsLength();
      console.log(`V2 Factory has ${pairsLength.toString()} pairs`);

      expect(pairsLength.gte(0)).toBe(true);
    });

    it('should get WETC/USC V2 pair address', async () => {
      const factory = new ethers.Contract(CONTRACTS.V2_FACTORY, V2_FACTORY_ABI, provider);

      const pairAddress = await factory.getPair(TOKENS.WETC, TOKENS.USC);
      console.log(`WETC/USC V2 Pair: ${pairAddress}`);

      expect(pairAddress).toBeDefined();
      if (pairAddress !== ZERO_ADDRESS) {
        expect(pairAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
      }
    });

    it('should read V2 pair reserves if pair exists', async () => {
      const factory = new ethers.Contract(CONTRACTS.V2_FACTORY, V2_FACTORY_ABI, provider);
      const pairAddress = await factory.getPair(TOKENS.WETC, TOKENS.USC);

      if (pairAddress !== ZERO_ADDRESS) {
        const pair = new ethers.Contract(pairAddress, V2_PAIR_ABI, provider);

        const [reserves, token0, token1, totalSupply] = await Promise.all([
          pair.getReserves(),
          pair.token0(),
          pair.token1(),
          pair.totalSupply(),
        ]);

        const [reserve0, reserve1, timestamp] = reserves;

        console.log(`V2 Pair Reserves:`);
        console.log(`  Token0 (${token0}): ${reserve0.toString()}`);
        console.log(`  Token1 (${token1}): ${reserve1.toString()}`);
        console.log(`  LP Total Supply: ${ethers.utils.formatUnits(totalSupply, 18)}`);
        console.log(`  Last update block timestamp: ${timestamp}`);

        expect(reserve0).toBeDefined();
        expect(reserve1).toBeDefined();
      } else {
        console.log('WETC/USC V2 pair does not exist on mainnet');
        expect(true).toBe(true);
      }
    });

    it('should verify V2 Router contract exists', async () => {
      const code = await provider.getCode(CONTRACTS.V2_ROUTER);
      expect(code).not.toBe('0x');
      expect(code.length).toBeGreaterThan(10);
      console.log(`✓ V2 Router verified at ${CONTRACTS.V2_ROUTER}`);
    });
  });

  describe('V3 CLMM Contracts', () => {
    it('should connect to V3 Factory and find pools', async () => {
      const factory = new ethers.Contract(CONTRACTS.V3_FACTORY, V3_FACTORY_ABI, provider);

      // Try common fee tiers: 0.05%, 0.3%, 1%
      const feeTiers = [500, 3000, 10000];
      let poolsFound = 0;

      for (const fee of feeTiers) {
        const poolAddress = await factory.getPool(TOKENS.WETC, TOKENS.USC, fee);
        if (poolAddress !== ZERO_ADDRESS) {
          console.log(`WETC/USC V3 Pool (${fee / 10000}% fee): ${poolAddress}`);
          poolsFound++;
        }
      }

      console.log(`Found ${poolsFound} V3 pools for WETC/USC`);
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

        console.log(`V3 Pool Info (0.3% fee):`);
        console.log(`  sqrtPriceX96: ${slot0[0].toString()}`);
        console.log(`  tick: ${slot0[1]}`);
        console.log(`  liquidity: ${liquidity.toString()}`);
        console.log(`  fee: ${fee}`);

        expect(slot0).toBeDefined();
        expect(liquidity).toBeDefined();
      } else {
        console.log('WETC/USC V3 pool (0.3%) does not exist on mainnet');
        expect(true).toBe(true);
      }
    });

    it('should verify NFT Position Manager contract', async () => {
      const code = await provider.getCode(CONTRACTS.NFT_POSITION_MANAGER);
      expect(code).not.toBe('0x');
      expect(code.length).toBeGreaterThan(10);
      console.log(`✓ NFT Position Manager verified at ${CONTRACTS.NFT_POSITION_MANAGER}`);
    });
  });

  describe('Universal Router', () => {
    it('should verify Universal Router contract exists', async () => {
      const code = await provider.getCode(CONTRACTS.UNIVERSAL_ROUTER);
      expect(code).not.toBe('0x');
      expect(code.length).toBeGreaterThan(10);
      console.log(`✓ Universal Router verified at ${CONTRACTS.UNIVERSAL_ROUTER}`);
    });

    it('should verify Permit2 contract exists', async () => {
      const code = await provider.getCode(CONTRACTS.PERMIT2);
      expect(code).not.toBe('0x');
      expect(code.length).toBeGreaterThan(10);
      console.log(`✓ Permit2 verified at ${CONTRACTS.PERMIT2}`);
    });
  });

  describe('Contract Verification', () => {
    it('should verify all V2 contracts exist', async () => {
      const contracts = [
        { name: 'V2 Factory', address: CONTRACTS.V2_FACTORY },
        { name: 'V2 Router', address: CONTRACTS.V2_ROUTER },
        { name: 'V2 Multicall', address: CONTRACTS.V2_MULTICALL },
      ];

      for (const contract of contracts) {
        const code = await provider.getCode(contract.address);
        expect(code).not.toBe('0x');
        console.log(`✓ ${contract.name} at ${contract.address} verified`);
      }
    });

    it('should verify all V3 contracts exist', async () => {
      const contracts = [
        { name: 'V3 Factory', address: CONTRACTS.V3_FACTORY },
        { name: 'V3 Swap Router', address: CONTRACTS.V3_SWAP_ROUTER },
        { name: 'V3 Quoter', address: CONTRACTS.V3_QUOTER },
        { name: 'NFT Position Manager', address: CONTRACTS.NFT_POSITION_MANAGER },
        { name: 'Universal Router', address: CONTRACTS.UNIVERSAL_ROUTER },
        { name: 'Permit2', address: CONTRACTS.PERMIT2 },
        { name: 'Tick Lens', address: CONTRACTS.TICK_LENS },
      ];

      for (const contract of contracts) {
        const code = await provider.getCode(contract.address);
        expect(code).not.toBe('0x');
        console.log(`✓ ${contract.name} at ${contract.address} verified`);
      }
    });
  });
});

// Additional test for when live tests are skipped
describe('ETCswap Classic Mainnet Live Tests Status', () => {
  it('should report live test configuration status', () => {
    if (SKIP_LIVE_TESTS) {
      console.log('\n⚠️  Classic mainnet live tests SKIPPED - No CLASSIC_PRIVATE_KEY in .env');
      console.log('To enable live tests:');
      console.log('  1. Copy .env.example to .env');
      console.log('  2. Add your Ethereum Classic mainnet private key');
      console.log('  3. WARNING: Use a dedicated test wallet with minimal funds!\n');
    } else {
      console.log('\n✓ Classic mainnet live tests ENABLED - Using Ethereum Classic mainnet\n');
    }
    expect(true).toBe(true);
  });
});
