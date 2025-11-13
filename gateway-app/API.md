# Gateway App - API Client Documentation

This document describes the typed API client for interacting with the Gateway backend.

## Overview

The Gateway API client (`GatewayAPI.ts`) provides a type-safe interface to all Gateway backend endpoints. It uses TypeScript types from the Gateway backend schemas to ensure compile-time type safety.

**Location**: `src/lib/GatewayAPI.ts`

## Architecture

The API client is organized into logical namespaces:

```typescript
import { gatewayAPI } from '@/lib/GatewayAPI';

// Available namespaces:
gatewayAPI.config   // Configuration endpoints
gatewayAPI.chains   // Chain operations (balances, tokens, status)
gatewayAPI.tokens   // Token management
gatewayAPI.pools    // Pool operations
gatewayAPI.clmm     // Concentrated liquidity operations
gatewayAPI.router   // DEX router/swap operations
```

## API Namespaces

### ConfigAPI

Access configuration data.

**Methods**:

#### `getChains()`
Get all available chains and their networks.

```typescript
const data = await gatewayAPI.config.getChains();
// Returns: { chains: Array<{ chain: string, networks: string[] }> }

// Example:
// {
//   chains: [
//     { chain: 'ethereum', networks: ['mainnet', 'sepolia'] },
//     { chain: 'solana', networks: ['mainnet-beta', 'devnet'] }
//   ]
// }
```

#### `getConnectors()`
Get all available DEX connectors.

```typescript
const data = await gatewayAPI.config.getConnectors();
// Returns: { connectors: ConnectorConfig[] }

// Example:
// {
//   connectors: [
//     { name: 'uniswap', chain: 'ethereum', type: ['router', 'amm', 'clmm'] },
//     { name: 'jupiter', chain: 'solana', type: ['router'] }
//   ]
// }
```

#### `getNamespaces()`
Get all configuration namespaces.

```typescript
const data = await gatewayAPI.config.getNamespaces();
// Returns: { namespaces: string[] }
```

#### `getAll()`
Get all configuration data.

```typescript
const config = await gatewayAPI.config.getAll();
// Returns: Record<string, any>
```

#### `update(namespace: string, updates: Record<string, any>)`
Update configuration values.

```typescript
await gatewayAPI.config.update('ethereum', {
  'networks.mainnet.nodeURL': 'https://mainnet.infura.io/v3/...'
});
```

---

### ChainAPI

Blockchain operations.

**Methods**:

#### `getBalances(chain: string, params: BalanceRequestType)`
Get token balances for a wallet.

```typescript
const balances = await gatewayAPI.chains.getBalances('solana', {
  network: 'mainnet-beta',
  address: 'YOUR_WALLET_ADDRESS'
});

// Returns: BalanceResponseType
// {
//   network: 'mainnet-beta',
//   timestamp: 1234567890,
//   latency: 123,
//   balances: {
//     SOL: 1.5,
//     USDC: 100.0
//   }
// }
```

#### `getTokens(chain: string, network: string)`
Get all supported tokens for a network.

```typescript
const tokens = await gatewayAPI.chains.getTokens('ethereum', 'mainnet');

// Returns: TokensResponseType
// {
//   tokens: [
//     { symbol: 'ETH', address: '0x...', decimals: 18, name: 'Ethereum' },
//     { symbol: 'USDC', address: '0x...', decimals: 6, name: 'USD Coin' }
//   ]
// }
```

#### `getStatus(chain: string, network: string)`
Get chain connection status.

```typescript
const status = await gatewayAPI.chains.getStatus('solana', 'mainnet-beta');

// Returns: StatusResponseType
// {
//   chain: 'solana',
//   network: 'mainnet-beta',
//   rpcUrl: 'https://...',
//   currentBlockNumber: 123456789,
//   nativeCurrency: 'SOL'
// }
```

---

### TokenAPI

Token management operations.

**Methods**:

#### `approve(params: ApproveRequestType)`
Approve token spending.

```typescript
const result = await gatewayAPI.tokens.approve({
  chain: 'ethereum',
  network: 'mainnet',
  address: 'YOUR_WALLET_ADDRESS',
  token: '0xTOKEN_ADDRESS',
  spender: '0xSPENDER_ADDRESS',
  amount: '1000000000000000000' // 1 token with 18 decimals
});

// Returns: ApproveResponseType
// {
//   network: 'mainnet',
//   timestamp: 1234567890,
//   latency: 456,
//   tokenAddress: '0x...',
//   spender: '0x...',
//   amount: '1000000000000000000',
//   nonce: 1,
//   approval: {
//     hash: '0xTXHASH',
//     ...
//   }
// }
```

---

### PoolAPI

Pool information and management.

**Methods**:

#### `list(connector: string, network: string)`
Get all pools for a connector.

```typescript
const pools = await gatewayAPI.pools.list('uniswap', 'mainnet');

// Returns: { pools: PoolTemplate[] }
```

#### `getInfo(connector: string, network: string, address: string)`
Get detailed pool information.

```typescript
const poolInfo = await gatewayAPI.pools.getInfo(
  'raydium',
  'mainnet-beta',
  'POOL_ADDRESS'
);

// Returns: pool data with reserves, fees, etc.
```

#### `add(params: { connector: string, type: string, network: string, address: string })`
Add a new pool to configuration.

```typescript
await gatewayAPI.pools.add({
  connector: 'meteora',
  type: 'clmm',
  network: 'mainnet-beta',
  address: 'NEW_POOL_ADDRESS'
});
```

---

### CLMMAPI

Concentrated liquidity market maker operations.

**Methods**:

#### `getPositionsOwned(connector: string, network: string, address: string)`
Get all positions owned by a wallet.

```typescript
const positions = await gatewayAPI.clmm.getPositionsOwned(
  'uniswap',
  'mainnet',
  'YOUR_WALLET_ADDRESS'
);

// Returns: { positions: PositionInfo[] }
// Each position includes:
// - address: position NFT address
// - poolAddress: the pool address
// - baseTokenAmount: amount of base token
// - quoteTokenAmount: amount of quote token
// - lowerPrice: lower price bound
// - upperPrice: upper price bound
// - uncollectedFees: pending fee amounts
```

#### `openPosition(connector: string, params: OpenPositionRequestType)`
Open a new liquidity position.

```typescript
const result = await gatewayAPI.clmm.openPosition('meteora', {
  network: 'mainnet-beta',
  walletAddress: 'YOUR_WALLET_ADDRESS',
  poolAddress: 'POOL_ADDRESS',
  lowerPrice: 0.95,
  upperPrice: 1.05,
  baseTokenAmount: 100,
  quoteTokenAmount: 100
});

// Returns: OpenPositionResponseType with transaction signature
```

#### `collectFees(connector: string, params: CollectFeesRequestType)`
Collect accumulated fees from a position.

```typescript
const result = await gatewayAPI.clmm.collectFees('uniswap', {
  network: 'mainnet',
  walletAddress: 'YOUR_WALLET_ADDRESS',
  positionAddress: 'POSITION_ADDRESS'
});
```

#### `closePosition(connector: string, params: ClosePositionRequestType)`
Close a liquidity position.

```typescript
const result = await gatewayAPI.clmm.closePosition('raydium', {
  network: 'mainnet-beta',
  walletAddress: 'YOUR_WALLET_ADDRESS',
  positionAddress: 'POSITION_ADDRESS'
});
```

---

### RouterAPI

DEX aggregator swap operations.

**Methods**:

#### `quoteSwap(connector: string, params: RouterQuoteRequest)`
Get a swap quote.

```typescript
const quote = await gatewayAPI.router.quoteSwap('jupiter', {
  network: 'mainnet-beta',
  baseToken: 'SOL',
  quoteToken: 'USDC',
  amount: 1.0,
  side: 'SELL',
  slippagePct: 1.0
});

// Returns: RouterQuoteResponse
// {
//   network: 'mainnet-beta',
//   timestamp: 1234567890,
//   latency: 123,
//   baseToken: 'SOL',
//   quoteToken: 'USDC',
//   baseAmount: '1000000000', // 1 SOL in lamports
//   quoteAmount: '45123456', // ~45 USDC
//   expectedAmount: '45.12',
//   price: '45.12',
//   gasPrice: 5000,
//   gasCost: '0.000005',
//   gasCostInUSD: '0.0002',
//   priceImpactPct: 0.05
// }
```

#### `executeSwap(connector: string, params: ExecuteSwapRequestType)`
Execute a swap transaction.

```typescript
const result = await gatewayAPI.router.executeSwap('0x', {
  network: 'mainnet',
  walletAddress: 'YOUR_WALLET_ADDRESS',
  baseToken: 'ETH',
  quoteToken: 'USDC',
  amount: 1.0,
  side: 'SELL',
  slippagePct: 1.0
});

// Returns: SwapExecuteResponseType
// {
//   network: 'mainnet',
//   timestamp: 1234567890,
//   latency: 456,
//   signature: '0xTXHASH',
//   baseToken: 'ETH',
//   quoteToken: 'USDC',
//   baseAmount: '1000000000000000000',
//   quoteAmount: '1800000000',
//   gasPrice: 50000000000,
//   gasUsed: 150000,
//   gasCost: '7500000000000000'
// }
```

---

## Error Handling

All API methods throw errors that should be caught:

```typescript
import toast from 'react-hot-toast';

async function loadBalances() {
  try {
    const data = await gatewayAPI.chains.getBalances('solana', {
      network: 'mainnet-beta',
      address: walletAddress
    });
    setBalances(data.balances);
  } catch (error) {
    console.error('Failed to load balances:', error);
    toast.error(`Failed to load balances: ${error.message}`);
  }
}
```

## Type Safety

The API client uses TypeScript types from Gateway backend schemas:

```typescript
import type {
  BalanceRequestType,
  BalanceResponseType,
  RouterQuoteRequest,
  RouterQuoteResponse
} from '@gateway/chains/solana/solana-schema';
```

This provides:
- **Compile-time validation**: TypeScript catches type errors before runtime
- **IDE autocomplete**: Full IntelliSense support
- **Documentation**: Inline type hints for all parameters

## Usage Examples

### Portfolio Balance Loading

```typescript
function PortfolioView() {
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  async function loadBalances(chain: string, network: string, address: string) {
    setLoading(true);
    try {
      const data = await gatewayAPI.chains.getBalances(chain, {
        network,
        address
      });
      setBalances(data.balances);
    } catch (error) {
      toast.error('Failed to load balances');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {loading ? (
        <LoadingState />
      ) : (
        <BalancesList balances={balances} />
      )}
    </div>
  );
}
```

### Swap Quote and Execute

```typescript
function SwapView() {
  const [quote, setQuote] = useState<RouterQuoteResponse | null>(null);

  async function getQuote() {
    try {
      const quoteData = await gatewayAPI.router.quoteSwap('jupiter', {
        network: 'mainnet-beta',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: parseFloat(amount),
        side: 'SELL',
        slippagePct: 1.0
      });
      setQuote(quoteData);
    } catch (error) {
      toast.error('Failed to get quote');
    }
  }

  async function executeSwap() {
    try {
      const result = await gatewayAPI.router.executeSwap('jupiter', {
        network: 'mainnet-beta',
        walletAddress: selectedWallet,
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: parseFloat(amount),
        side: 'SELL',
        slippagePct: 1.0
      });

      toast.success(`Swap executed! TX: ${result.signature}`);
    } catch (error) {
      toast.error('Failed to execute swap');
    }
  }

  return (
    <div>
      <button onClick={getQuote}>Get Quote</button>
      {quote && (
        <>
          <QuoteDisplay quote={quote} />
          <button onClick={executeSwap}>Execute Swap</button>
        </>
      )}
    </div>
  );
}
```

### CLMM Position Management

```typescript
function LiquidityView() {
  const [positions, setPositions] = useState<PositionInfo[]>([]);

  async function loadPositions() {
    try {
      const data = await gatewayAPI.clmm.getPositionsOwned(
        'meteora',
        'mainnet-beta',
        walletAddress
      );
      setPositions(data.positions);
    } catch (error) {
      toast.error('Failed to load positions');
    }
  }

  async function openNewPosition() {
    try {
      await gatewayAPI.clmm.openPosition('meteora', {
        network: 'mainnet-beta',
        walletAddress,
        poolAddress: selectedPool,
        lowerPrice: parseFloat(lowerPrice),
        upperPrice: parseFloat(upperPrice),
        baseTokenAmount: parseFloat(baseAmount),
        quoteTokenAmount: parseFloat(quoteAmount)
      });

      toast.success('Position opened successfully!');
      await loadPositions();
    } catch (error) {
      toast.error('Failed to open position');
    }
  }

  async function collectPositionFees(position: PositionInfo) {
    try {
      await gatewayAPI.clmm.collectFees('meteora', {
        network: 'mainnet-beta',
        walletAddress,
        positionAddress: position.address
      });

      toast.success('Fees collected!');
      await loadPositions();
    } catch (error) {
      toast.error('Failed to collect fees');
    }
  }

  return (
    <div>
      <button onClick={openNewPosition}>Open Position</button>
      {positions.map(position => (
        <PositionCard
          key={position.address}
          position={position}
          onCollectFees={() => collectPositionFees(position)}
        />
      ))}
    </div>
  );
}
```

## Environment Configuration

The API client uses the Gateway URL from environment variables:

**Development** (local):
Create `.env.local`:
```bash
VITE_GATEWAY_URL=http://localhost:15888
```

**Docker**:
Set in `docker-compose.yml`:
```yaml
environment:
  - VITE_GATEWAY_URL=http://localhost:15888
```

**Tauri**:
The API client automatically detects Tauri environment and uses `@tauri-apps/plugin-http` for secure requests.

## Testing

Mock the API client in tests:

```typescript
import { gatewayAPI } from '@/lib/GatewayAPI';

jest.mock('@/lib/GatewayAPI', () => ({
  gatewayAPI: {
    chains: {
      getBalances: jest.fn().mockResolvedValue({
        balances: { SOL: 1.5, USDC: 100 }
      })
    }
  }
}));

test('loads balances', async () => {
  render(<PortfolioView />);
  await waitFor(() => {
    expect(screen.getByText('1.5 SOL')).toBeInTheDocument();
  });
});
```
