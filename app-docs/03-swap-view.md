# Swap View - Mockup & Specification

## ASCII Mockup

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  Gateway                                             [Solana ▾] [0x7a3F...b2E4 ▾] │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  Wallet       ┌─ Swap ──┐    Pools    Liquidity    Configs                    │
│                                                                                │
│                                                                                │
│              ┌───────────────────────────────────────────┐                     │
│              │  Swap                                     │                     │
│              │                                           │                     │
│              │  Connector: [Jupiter (Router) ▾]         │                     │
│              │                                           │                     │
│              │  ┌────────────────────────────────────┐  │                     │
│              │  │ From                               │  │                     │
│              │  │ ≋ SOL                    [Change]  │  │                     │
│              │  │                                    │  │                     │
│              │  │ [1.0____________]          Max     │  │                     │
│              │  │                                    │  │                     │
│              │  │ Balance: 0.04982 SOL               │  │                     │
│              │  └────────────────────────────────────┘  │                     │
│              │                   ⇅                      │                     │
│              │  ┌────────────────────────────────────┐  │                     │
│              │  │ To                                 │  │                     │
│              │  │ 💵 USDC                  [Change]  │  │                     │
│              │  │                                    │  │                     │
│              │  │ 158.15                             │  │                     │
│              │  │                                    │  │                     │
│              │  │ Balance: 0 USDC                    │  │                     │
│              │  └────────────────────────────────────┘  │                     │
│              │                                           │                     │
│              │  Slippage: [0.5%]  [⚙️ Settings]         │                     │
│              │                                           │                     │
│              │  ┌─────────────────────────────────────┐ │                     │
│              │  │ Quote Details                       │ │                     │
│              │  │                                     │ │                     │
│              │  │ Rate: 1 SOL = 158.15 USDC           │ │                     │
│              │  │ Price Impact: 0.08%                 │ │                     │
│              │  │ Min. Received: 157.36 USDC          │ │                     │
│              │  │ Fee: ~0.001 SOL                     │ │                     │
│              │  │                                     │ │                     │
│              │  └─────────────────────────────────────┘ │                     │
│              │                                           │                     │
│              │         [Get Quote]  [Execute Swap]       │                     │
│              │                                           │                     │
│              └───────────────────────────────────────────┘                     │
│                                                                                │
│              ┌─ Recent Swaps ────────────────────────────────────────────────┐ │
│              │ 1.0 SOL → 157.89 USDC     ✓ Confirmed    2 min ago           │ │
│              │ 0.5 ETH → 1,650 USDC      ⏳ Pending      Just now            │ │
│              └──────────────────────────────────────────────────────────────┘ │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

## Layout Structure

### Swap Widget (Centered Card)
```
┌───────────────────────────────────────────┐
│  Swap                                     │
│                                           │
│  Connector: [Jupiter (Router) ▾]         │
│                                           │
│  ┌────────────────────────────────────┐  │
│  │ From                               │  │
│  │ ≋ SOL                    [Change]  │  │
│  │ [1.0____________]          Max     │  │
│  │ Balance: 0.04982 SOL               │  │
│  └────────────────────────────────────┘  │
│                   ⇅                      │
│  ┌────────────────────────────────────┐  │
│  │ To                                 │  │
│  │ 💵 USDC                  [Change]  │  │
│  │ 158.15                             │  │
│  │ Balance: 0 USDC                    │  │
│  └────────────────────────────────────┘  │
│                                           │
│  Slippage: [0.5%]  [⚙️ Settings]         │
│                                           │
│  [Quote Details (Expandable)]             │
│                                           │
│         [Get Quote]  [Execute Swap]       │
└───────────────────────────────────────────┘
```

### Components Breakdown

#### Connector Selector
```
Connector: [Jupiter (Router) ▾]

Options:
┌─ Select Connector ───────┐
│ Routers/Aggregators      │
│ ● Jupiter (Solana)       │
│   0x (Ethereum)          │
│   Uniswap Router (ETH)   │
│                          │
│ Direct AMM/CLMM          │
│   Raydium CLMM           │
│   Raydium AMM            │
│   Meteora DLMM           │
│   Uniswap V3             │
│   Uniswap V2             │
│   PancakeSwap V3         │
│   PancakeSwap V2         │
└──────────────────────────┘
```

**Note:** Routers (Jupiter, 0x) find best routes across multiple pools automatically. Direct connectors use specific pools.

#### From Token Card
```
┌────────────────────────────────────┐
│ From                               │
│ ≋ SOL                    [Change]  │ ← Click to open token selector
│                                    │
│ [1.0____________]          Max     │ ← Amount input + Max button
│                                    │
│ Balance: 0.04982 SOL               │ ← Shows current balance
└────────────────────────────────────┘
```

**Interactions:**
- Click token symbol/icon → Opens TokenSelectorModal
- Type in amount input → Auto-updates quote (debounced)
- Click "Max" → Sets input to full balance

#### Swap Direction Toggle
```
⇅  ← Click to flip tokens
```

Clicking swaps "From" and "To" tokens.

#### To Token Card
```
┌────────────────────────────────────┐
│ To                                 │
│ 💵 USDC                  [Change]  │
│                                    │
│ 158.15                             │ ← Calculated from quote
│                                    │
│ Balance: 0 USDC                    │
└────────────────────────────────────┘
```

**Note:** Amount is **read-only**, calculated from quote.

#### Slippage Settings
```
Slippage: [0.5%]  [⚙️ Settings]

Click Settings →
┌─ Slippage Settings ──────┐
│ Preset:                  │
│ ○ 0.1%  ● 0.5%  ○ 1%     │
│ ○ 3%    ○ Custom         │
│                          │
│ Custom: [____]%          │
│                          │
│ ⚠️ High slippage warning │
│ if > 3%                  │
│                          │
│        [Apply] [Cancel]  │
└──────────────────────────┘
```

#### Quote Details (Expandable)
```
┌─────────────────────────────────────┐
│ Quote Details                  [▼]  │ ← Click to expand/collapse
│                                     │
│ Rate: 1 SOL = 158.15 USDC           │
│ Price Impact: 0.08%                 │
│ Min. Received: 157.36 USDC          │
│ Fee: ~0.001 SOL                     │
│ Route: SOL → USDC (Direct)          │ ← For routers, show path
│                                     │
└─────────────────────────────────────┘
```

**Shows:**
- Exchange rate
- Price impact %
- Minimum tokens received (after slippage)
- Transaction fee estimate
- Route path (for aggregators like Jupiter)

#### Action Buttons
```
[Get Quote]  [Execute Swap]
```

**States:**
- **Initial**: "Get Quote" enabled, "Execute Swap" disabled
- **After Quote**: Both enabled
- **Loading**: Show spinner, disable buttons
- **Error**: Show error message, enable "Get Quote" to retry

### Token Selector Modal
```
┌─ Select Token ────────────────────┐
│ [Search tokens...___________]  ✕  │
│                                   │
│ Popular                           │
│ ┌─────────────────────────────┐   │
│ │ ≋ SOL      0.04982  $7.89   │   │
│ │ 💵 USDC    0         $0.00   │   │
│ │ 🟢 USDT    100       $100.00 │   │
│ └─────────────────────────────┘   │
│                                   │
│ All Tokens                        │
│ ┌─────────────────────────────┐   │
│ │ ⚛️ ATOM     0        $0.00   │   │
│ │ 🔵 BTC     0         $0.00   │   │
│ │ Ⓒ CRV     0         $0.00   │   │
│ └─────────────────────────────┘   │
└───────────────────────────────────┘
```

**Features:**
- Search by symbol or name
- Shows balance + USD value
- Popular tokens at top
- Click token to select

### Recent Swaps Section
```
┌─ Recent Swaps ────────────────────────────────────────────┐
│ 1.0 SOL → 157.89 USDC     ✓ Confirmed    2 min ago       │
│ 0.5 ETH → 1,650 USDC      ⏳ Pending      Just now        │
│ 100 USDC → 0.63 SOL       ✗ Failed       5 min ago       │
└──────────────────────────────────────────────────────────┘
```

**Shows:**
- Token amounts in/out
- Status icon (✓ confirmed, ⏳ pending, ✗ failed)
- Timestamp
- Click row → View on block explorer

## API Calls

### Get Quote (Router)

```typescript
POST /connectors/{connector}/router/quote-swap
Body: {
  network: "mainnet-beta",
  baseToken: "SOL",
  quoteToken: "USDC",
  amount: 1.0,
  side: "SELL",
  slippagePct: 0.5
}

Response:
{
  quoteId: "unique-quote-id",
  tokenIn: "So11111111111111111111111111111111111111112",
  tokenOut: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  amountIn: 1.0,
  amountOut: 158.15,
  price: 158.15,
  priceImpactPct: 0.08,
  minAmountOut: 157.36,
  maxAmountIn: 1.005
}
```

### Execute Swap (Router)

```typescript
POST /connectors/{connector}/router/execute-swap
Body: {
  network: "mainnet-beta",
  walletAddress: "user-wallet-address",
  baseToken: "SOL",
  quoteToken: "USDC",
  amount: 1.0,
  side: "SELL",
  slippagePct: 0.5
}

Response:
{
  signature: "tx-signature-hash",
  status: 0,  // 0=PENDING, 1=CONFIRMED, -1=FAILED
  data: {
    tokenIn: "So11...",
    tokenOut: "EPjF...",
    amountIn: 1.0,
    amountOut: 157.89,
    fee: 0.001
  }
}
```

### Poll Transaction

```typescript
GET /chains/{chain}/poll?network={network}&signature={signature}

Response:
{
  status: 1,  // CONFIRMED
  blockNumber: 12345678,
  balanceChanges?: {
    "SOL": -1.001,
    "USDC": 157.89
  }
}
```

## Component Breakdown

### SwapView.tsx
```typescript
- State:
  - connector: string
  - fromToken: string
  - toToken: string
  - amount: string
  - slippage: number
  - quote: QuoteSwapResponse | null
  - loading: boolean
  - txStatus: 'idle' | 'pending' | 'confirmed' | 'failed'

- Functions:
  - getQuote()
  - executeSwap()
  - pollTransaction(signature)
  - flipTokens()
```

### SwapWidget.tsx
```typescript
- Props: connector, fromToken, toToken, amount, slippage
- Renders: Token cards, amount inputs, buttons
- Emits: onGetQuote, onExecuteSwap, onTokenChange
```

### TokenSelectorModal.tsx
```typescript
- Props: isOpen, onClose, onSelect, selectedNetwork
- State:
  - searchQuery: string
  - tokens: Token[]
  - balances: Record<string, number>
- Filter tokens by search
- Show popular tokens first
```

### SlippageSettings.tsx
```typescript
- Props: value, onChange
- Preset buttons: 0.1%, 0.5%, 1%, 3%
- Custom input
- Warning for high slippage
```

### QuoteDetails.tsx
```typescript
- Props: quote
- Displays quote information
- Expandable/collapsible
```

### RecentSwaps.tsx
```typescript
- Props: swaps[]
- Shows recent transactions
- Stored in localStorage
- Click → Open block explorer
```

## User Flows

### Basic Swap Flow
```
1. User selects connector (Jupiter)
2. User selects From token (SOL)
3. User selects To token (USDC)
4. User enters amount (1.0)
   ↓
5. User clicks "Get Quote"
6. App calls POST /connectors/jupiter/router/quote-swap
   ↓
7. Display quote details
8. User reviews quote
9. User clicks "Execute Swap"
   ↓
10. App calls POST /connectors/jupiter/router/execute-swap
11. Show "Pending" status
    ↓
12. App polls GET /chains/solana/poll every 2 seconds
13. When confirmed, show "Confirmed" status
14. Add to Recent Swaps
15. Refresh balances
```

### Error Handling
```
Quote Failed:
- Show error message
- Keep "Get Quote" button enabled
- Allow retry

Execution Failed:
- Show error message
- Show transaction hash if available
- Keep quote for retry

Transaction Failed (on-chain):
- Update status to "Failed"
- Show reason if available
- Keep quote for retry
```

## State Management

```typescript
// Local component state
interface SwapState {
  connector: string;
  fromToken: string;
  toToken: string;
  amount: string;
  slippage: number;
  quote: QuoteSwapResponse | null;
  loading: boolean;
  txSignature: string | null;
  txStatus: 'idle' | 'pending' | 'confirmed' | 'failed';
}

// Recent swaps (localStorage)
interface SwapHistory {
  swaps: Array<{
    fromToken: string;
    toToken: string;
    amountIn: number;
    amountOut: number;
    signature: string;
    status: 'pending' | 'confirmed' | 'failed';
    timestamp: number;
  }>;
}
```

## Styling Notes

- **Centered card**: Max width 500px, centered on page
- **Token cards**: Light background, rounded corners
- **Swap direction toggle**: Circular button between cards
- **Amount inputs**: Large font, clear focus state
- **Buttons**: Primary color for "Execute Swap", secondary for "Get Quote"
- **Quote details**: Subtle background, smaller font
- **Loading states**: Spinner on buttons
- **Error states**: Red border + error message below

## Validation

- **Amount > 0**: Cannot be zero or negative
- **Amount <= Balance**: Cannot exceed wallet balance
- **Tokens selected**: Both tokens must be selected
- **Different tokens**: From and To must be different
- **Wallet connected**: Must have selected wallet
- **Quote fresh**: Quote expires after 30 seconds (re-quote needed)

## Edge Cases

- **Insufficient balance**: Disable "Execute Swap", show warning
- **Same token selected**: Show error, disable buttons
- **No quote**: Disable "Execute Swap" until quote fetched
- **Quote expired**: Show warning, require re-quote
- **Network congestion**: Show estimated wait time
- **High price impact**: Show warning (> 5%)
- **Transaction stuck**: Provide "Speed Up" option (increase fee)

## Future Enhancements (V2)

- [ ] Chart showing price history
- [ ] Multiple routes comparison (for routers)
- [ ] Limit orders (if supported by connector)
- [ ] DCA (Dollar Cost Averaging) scheduling
- [ ] Approve token spending (EVM chains)
- [ ] Gas price selector (EVM chains)
- [ ] Swap settings: priority fee, compute units (Solana)
- [ ] Price alerts/notifications
- [ ] Swap analytics (total volume, best rate, etc.)
