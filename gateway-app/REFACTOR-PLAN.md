# Gateway-App Refactor Plan

**Purpose**: Transform gateway-app into a clean reference implementation that demonstrates best practices for building clients on top of the Gateway API.

**Status**: Ready for implementation
**Est. Code Reduction**: 30-40% through proper abstraction and reuse

---

## Executive Summary

The gateway-app currently has:
- **9 type definitions** that duplicate Gateway schemas
- **4+ helper functions** duplicated across files
- **6+ component patterns** repeated without abstraction
- **0% API type safety** (using `any` everywhere)
- **30+ error handling blocks** with identical patterns

**Key Opportunity**: The tsconfig already includes `@gateway/*` path alias pointing to `../src/*`, enabling direct imports from Gateway schemas!

---

## Phase 1: Import Gateway Schemas (HIGH PRIORITY)

### 1.1 Replace TokenInfo Definition

**Current** (utils.ts:9-14):
```typescript
export interface TokenInfo {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
}
```

**Change to**:
```typescript
import type { TokensResponseType } from '@gateway/schemas/chain-schema';

// Extract the token type from the response array
export type TokenInfo = TokensResponseType['tokens'][number];
```

**Files affected**:
- `src/lib/utils.ts`
- `src/components/SwapView.tsx`
- `src/components/PortfolioView.tsx`

---

### 1.2 Replace Position Interfaces

**Current** (PortfolioView.tsx:20-37):
```typescript
interface Position {
  address: string;
  poolAddress: string;
  baseTokenAddress: string;
  quoteTokenAddress: string;
  baseTokenAmount: number;
  quoteTokenAmount: number;
  baseFeeAmount: number;
  quoteFeeAmount: number;
  lowerBinId: number;
  upperBinId: number;
  lowerPrice: number;
  upperPrice: number;
  price: number;
  rewardTokenAddress?: string;
  rewardAmount?: number;
  connector: string;
}
```

**Change to**:
```typescript
import type { PositionInfo } from '@gateway/schemas/clmm-schema';

interface Position extends PositionInfo {
  connector: string;  // Add UI-specific field
}
```

**Files affected**:
- `src/components/PortfolioView.tsx`
- `src/components/PoolsView.tsx`
- `src/components/LiquidityView.tsx`

---

### 1.3 Replace PoolInfo Interfaces

**Current** (PoolsView.tsx:22-36):
```typescript
interface PoolInfo {
  address: string;
  baseTokenAddress: string;
  quoteTokenAddress: string;
  feePct: number;
  price: number;
  baseTokenAmount: number;
  quoteTokenAmount: number;
  activeBinId?: number;
  binStep?: number;
  sqrtPriceX64?: string;
  tick?: number;
  liquidity?: string;
}
```

**Change to**:
```typescript
import type { PoolInfo as CLMMPoolInfo } from '@gateway/schemas/clmm-schema';
import type { PoolInfo as AMMPoolInfo } from '@gateway/schemas/amm-schema';

// Use discriminated union based on pool type
type PoolInfo = CLMMPoolInfo | AMMPoolInfo;
```

**Files affected**:
- `src/components/PoolsView.tsx`
- `src/components/LiquidityView.tsx`

---

### 1.4 Replace QuoteResult

**Current** (SwapView.tsx:11-23):
```typescript
interface QuoteResult {
  expectedAmount: string;
  priceImpact?: number;
  route?: string[];
  // ... mixed properties from different schemas
}
```

**Change to**:
```typescript
import type { QuoteSwapResponseType as RouterQuoteResponse } from '@gateway/schemas/router-schema';
import type { QuoteSwapResponseType as CLMMQuoteResponse } from '@gateway/schemas/clmm-schema';

type QuoteResult = RouterQuoteResponse | CLMMQuoteResponse;
```

**Files affected**:
- `src/components/SwapView.tsx`

---

### 1.5 Replace ChainStatus

**Current** (NetworkStatus.tsx:4-12):
```typescript
interface ChainStatus {
  chain: string;
  network: string;
  rpcUrl: string;
  connection: boolean;
  // ...
}
```

**Change to**:
```typescript
import type { StatusResponseType as ChainStatus } from '@gateway/schemas/chain-schema';
```

**Files affected**:
- `src/components/NetworkStatus.tsx`

---

### 1.6 Create Gateway Types Re-export Module

**Create** `src/lib/gateway-types.ts`:
```typescript
// Re-export all commonly used Gateway types for easy access
export type {
  // Chain schemas
  BalanceRequestType,
  BalanceResponseType,
  TokensResponseType,
  StatusResponseType,
  TransactionStatus,
} from '@gateway/schemas/chain-schema';

export type {
  // CLMM schemas
  PositionInfo,
  PoolInfo as CLMMPoolInfo,
  QuoteSwapRequestType as CLMMQuoteRequest,
  QuoteSwapResponseType as CLMMQuoteResponse,
  OpenPositionRequestType,
  OpenPositionResponseType,
  AddLiquidityRequestType,
  RemoveLiquidityRequestType,
  CollectFeesRequestType,
  ClosePositionRequestType,
} from '@gateway/schemas/clmm-schema';

export type {
  // AMM schemas
  PoolInfo as AMMPoolInfo,
  QuoteSwapRequestType as AMMQuoteRequest,
  QuoteSwapResponseType as AMMQuoteResponse,
} from '@gateway/schemas/amm-schema';

export type {
  // Router schemas
  QuoteSwapRequestType as RouterQuoteRequest,
  QuoteSwapResponseType as RouterQuoteResponse,
  ExecuteSwapRequestType as RouterExecuteRequest,
  ExecuteSwapResponseType as RouterExecuteResponse,
} from '@gateway/schemas/router-schema';

// UI-specific type extensions
export type TokenInfo = TokensResponseType['tokens'][number];

export interface PositionWithConnector extends PositionInfo {
  connector: string;
}

export interface ConnectorConfig {
  name: string;
  trading_types: string[];
  chain: string;
  networks: string[];
}
```

---

## Phase 2: Extract Utility Functions (HIGH PRIORITY)

### 2.1 String Utilities

**Create** `src/lib/utils/string.ts`:
```typescript
/**
 * Capitalize first letter of string
 * @example capitalize('raydium') => 'Raydium'
 */
export function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Shorten an address for display
 * @example shortenAddress('0x1234...5678', 6, 4) => '0x1234...5678'
 */
export function shortenAddress(
  address: string,
  startChars = 6,
  endChars = 4
): string {
  if (!address || address.length <= startChars + endChars) {
    return address;
  }
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Construct chainNetwork string for API calls
 * @example getChainNetwork('solana', 'mainnet-beta') => 'solana-mainnet-beta'
 */
export function getChainNetwork(chain: string, network: string): string {
  return `${chain}-${network}`;
}
```

**Update imports in**:
- `src/components/PortfolioView.tsx` - remove capitalize(), use import
- `src/components/PoolsView.tsx` - remove capitalize(), use import
- `src/components/WalletSelector.tsx` - use shortenAddress()
- `src/components/SwapView.tsx` - use shortenAddress() and getChainNetwork()

---

### 2.2 Number Formatting Utilities

**Create** `src/lib/utils/format.ts`:
```typescript
/**
 * Format token amount with specified decimal places
 * Handles string and number inputs, returns string
 */
export function formatTokenAmount(
  amount: number | string,
  decimals = 6
): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0';
  return num.toFixed(decimals);
}

/**
 * Format price in scientific notation
 */
export function formatPrice(price: number, decimals = 6): string {
  if (isNaN(price)) return '0';
  return price.toExponential(decimals);
}

/**
 * Format percentage with specified decimal places
 */
export function formatPercent(value: number, decimals = 2): string {
  if (isNaN(value)) return '0%';
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format balance with smart decimal truncation
 * - Truncates to maxDecimals if exceeds
 * - Preserves original decimals if less
 */
export function formatBalance(
  balance: string | number,
  maxDecimals = 6
): string {
  const balanceStr = String(balance);
  const num = parseFloat(balanceStr);

  if (isNaN(num)) return balanceStr;

  const decimalIndex = balanceStr.indexOf('.');
  if (decimalIndex !== -1) {
    const actualDecimals = balanceStr.length - decimalIndex - 1;
    if (actualDecimals > maxDecimals) {
      return num.toFixed(maxDecimals);
    }
  }

  return balanceStr;
}

/**
 * Calculate percentage of value relative to total
 */
export function calculatePercentage(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(100, (value / total) * 100);
}
```

**Replace** 23 instances of `.toFixed(6)` across:
- PortfolioView.tsx
- SwapView.tsx
- PoolsView.tsx
- LiquidityView.tsx

---

### 2.3 API Helper Wrapper

**Create** `src/lib/utils/api-helpers.ts`:
```typescript
import { showSuccessNotification, showErrorNotification } from '../notifications';

/**
 * Wrapper for async operations with loading state and notifications
 * Reduces boilerplate error handling across components
 */
export async function withLoadingAndNotification<T>(
  operation: () => Promise<T>,
  setLoading: (loading: boolean) => void,
  options?: {
    successMessage?: string;
    errorPrefix?: string;
    onError?: (error: Error) => void;
  }
): Promise<T | null> {
  const { successMessage, errorPrefix = 'Operation failed', onError } = options || {};

  try {
    setLoading(true);
    const result = await operation();

    if (successMessage) {
      await showSuccessNotification(successMessage);
    }

    return result;
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Unknown error');
    const message = `${errorPrefix}: ${error.message}`;

    await showErrorNotification(message);

    if (onError) {
      onError(error);
    }

    return null;
  } finally {
    setLoading(false);
  }
}

/**
 * Retry wrapper for API calls with exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Unknown error');
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, i)));
      }
    }
  }

  throw lastError!;
}
```

---

## Phase 3: Create Reusable Components (MEDIUM PRIORITY)

### 3.1 BaseModal Component

**Create** `src/components/common/BaseModal.tsx`:
```typescript
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showCloseButton?: boolean;
}

const widthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
};

export function BaseModal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'md',
  showCloseButton = true
}: BaseModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <Card
        className={`w-full ${widthClasses[maxWidth]}`}
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>{title}</CardTitle>
            {showCloseButton && (
              <button
                onClick={onClose}
                className="p-1 hover:bg-accent rounded transition-colors"
                aria-label="Close modal"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}
```

**Refactor**:
- `AddTokenModal.tsx` - use BaseModal
- `AddWalletModal.tsx` - use BaseModal
- `ConfirmModal.tsx` - use BaseModal
- `NetworkStatus.tsx` - use BaseModal for status display

---

### 3.2 EmptyState Component

**Create** `src/components/common/EmptyState.tsx`:
```typescript
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <div className="flex items-center justify-center h-full">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {icon}
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">{message}</p>
          {action && (
            <button
              onClick={action.onClick}
              className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
            >
              {action.label}
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

**Replace** 3 identical "No Wallet Selected" patterns in:
- LiquidityView.tsx
- PoolsView.tsx
- PortfolioView.tsx

---

### 3.3 LoadingState Component

**Create** `src/components/common/LoadingState.tsx`:
```typescript
interface LoadingStateProps {
  message?: string;
  spinner?: boolean;
}

export function LoadingState({
  message = 'Loading...',
  spinner = true
}: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      {spinner && (
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      )}
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}
```

---

### 3.4 TokenSelector Component

**Create** `src/components/forms/TokenSelector.tsx`:
```typescript
import { Input } from '../ui/input';
import { Select } from '../ui/select';
import { Button } from '../ui/button';
import type { TokenInfo } from '@/lib/gateway-types';
import { formatBalance } from '@/lib/utils/format';

interface TokenSelectorProps {
  label: string;
  tokens: TokenInfo[];
  selectedToken: string;
  onTokenChange: (token: string) => void;

  // Optional amount input
  amount?: string;
  onAmountChange?: (amount: string) => void;
  amountReadOnly?: boolean;

  // Optional balance display
  balance?: string;
  showMaxButton?: boolean;
  onMaxClick?: () => void;

  // Styling
  className?: string;
}

export function TokenSelector({
  label,
  tokens,
  selectedToken,
  onTokenChange,
  amount,
  onAmountChange,
  amountReadOnly = false,
  balance,
  showMaxButton = false,
  onMaxClick,
  className = '',
}: TokenSelectorProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex justify-between items-center">
        <label className="text-xs md:text-sm font-medium">{label}</label>
        {balance !== undefined && (
          <div className="text-xs md:text-sm text-muted-foreground">
            Balance: {formatBalance(balance)}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Select
          value={selectedToken}
          onChange={(e) => onTokenChange(e.target.value)}
          className="w-32"
        >
          {tokens.map((token) => (
            <option key={token.symbol} value={token.symbol}>
              {token.symbol}
            </option>
          ))}
        </Select>

        {amount !== undefined && onAmountChange && (
          <div className="flex-1 flex gap-2">
            <Input
              type="number"
              placeholder="0.0"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
              readOnly={amountReadOnly}
              className="flex-1"
            />
            {showMaxButton && onMaxClick && (
              <Button
                onClick={onMaxClick}
                variant="outline"
                size="sm"
                disabled={!balance || balance === '0'}
              >
                Max
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Refactor** SwapView.tsx to use TokenSelector for both From and To tokens.

---

### 3.5 FormField Component

**Create** `src/components/forms/FormField.tsx`:
```typescript
import { Input } from '../ui/input';

interface FormFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  helpText?: string;
  required?: boolean;
  className?: string;
}

export function FormField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  disabled = false,
  error,
  helpText,
  required = false,
  className = '',
}: FormFieldProps) {
  return (
    <div className={`space-y-1 ${className}`}>
      <label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>

      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={error ? 'border-destructive' : ''}
      />

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {!error && helpText && (
        <p className="text-xs text-muted-foreground">{helpText}</p>
      )}
    </div>
  );
}
```

---

### 3.6 ActionButtons Component

**Create** `src/components/common/ActionButtons.tsx`:
```typescript
import { Button } from '../ui/button';

interface ActionButtonsProps {
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  confirmDisabled?: boolean;
  confirmVariant?: 'default' | 'destructive' | 'outline';
  loading?: boolean;
  loadingText?: string;
}

export function ActionButtons({
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmDisabled = false,
  confirmVariant = 'default',
  loading = false,
  loadingText = 'Processing...',
}: ActionButtonsProps) {
  return (
    <div className="flex gap-2">
      <Button
        onClick={onCancel}
        variant="outline"
        disabled={loading}
        className="flex-1"
      >
        {cancelText}
      </Button>
      <Button
        onClick={onConfirm}
        variant={confirmVariant}
        disabled={confirmDisabled || loading}
        className="flex-1"
      >
        {loading ? loadingText : confirmText}
      </Button>
    </div>
  );
}
```

---

## Phase 4: Create Typed API Client (MEDIUM PRIORITY)

### 4.1 Typed Gateway API Client

**Create** `src/lib/gateway-api.ts`:
```typescript
import { gatewayGet, gatewayPost, gatewayDelete } from './api';
import type {
  BalanceRequestType,
  BalanceResponseType,
  TokensResponseType,
  StatusResponseType,
  PositionInfo,
  CLMMPoolInfo,
  CLMMQuoteRequest,
  CLMMQuoteResponse,
  OpenPositionRequestType,
  OpenPositionResponseType,
  RouterQuoteRequest,
  RouterQuoteResponse,
  RouterExecuteRequest,
  RouterExecuteResponse,
} from './gateway-types';

/**
 * Typed Gateway API client
 * Provides type-safe methods for all Gateway endpoints
 */
export class GatewayAPI {
  // ==================== Chain Operations ====================

  static async getBalances(
    chain: string,
    request: BalanceRequestType
  ): Promise<BalanceResponseType> {
    return gatewayPost<BalanceResponseType>(
      `/chains/${chain}/balances`,
      request
    );
  }

  static async getTokens(
    chain: string,
    network: string,
    tokenSymbols?: string[]
  ): Promise<TokensResponseType> {
    const params = new URLSearchParams({ network });
    if (tokenSymbols) {
      params.append('tokenSymbols', tokenSymbols.join(','));
    }
    return gatewayGet<TokensResponseType>(
      `/tokens?chain=${chain}&${params.toString()}`
    );
  }

  static async getChainStatus(
    chain: string,
    network: string
  ): Promise<StatusResponseType> {
    return gatewayGet<StatusResponseType>(
      `/chains/${chain}/status?network=${network}`
    );
  }

  // ==================== CLMM Operations ====================

  static async getPositionsOwned(
    connector: string,
    chainNetwork: string,
    walletAddress: string
  ): Promise<PositionInfo[]> {
    return gatewayGet<PositionInfo[]>(
      `/trading/clmm/positions-owned?connector=${connector}&chainNetwork=${chainNetwork}&walletAddress=${walletAddress}`
    );
  }

  static async getPoolInfo(
    connector: string,
    chainNetwork: string,
    poolAddress: string
  ): Promise<CLMMPoolInfo> {
    return gatewayGet<CLMMPoolInfo>(
      `/trading/clmm/pool-info?connector=${connector}&chainNetwork=${chainNetwork}&poolAddress=${poolAddress}`
    );
  }

  static async quoteSwapCLMM(
    connector: string,
    chainNetwork: string,
    request: CLMMQuoteRequest
  ): Promise<CLMMQuoteResponse> {
    const params = new URLSearchParams({
      connector,
      chainNetwork,
      ...request as any,
    });
    return gatewayGet<CLMMQuoteResponse>(
      `/trading/clmm/quote-swap?${params.toString()}`
    );
  }

  static async openPosition(
    connector: string,
    chainNetwork: string,
    request: OpenPositionRequestType
  ): Promise<OpenPositionResponseType> {
    return gatewayPost<OpenPositionResponseType>(
      `/trading/clmm/open-position`,
      { connector, chainNetwork, ...request }
    );
  }

  // ==================== Router Operations ====================

  static async quoteSwapRouter(
    connector: string,
    network: string,
    request: RouterQuoteRequest
  ): Promise<RouterQuoteResponse> {
    const params = new URLSearchParams({
      network,
      ...request as any,
    });
    return gatewayGet<RouterQuoteResponse>(
      `/connectors/${connector}/router/quote-swap?${params.toString()}`
    );
  }

  static async executeSwapRouter(
    connector: string,
    request: RouterExecuteRequest
  ): Promise<RouterExecuteResponse> {
    return gatewayPost<RouterExecuteResponse>(
      `/connectors/${connector}/router/execute-swap`,
      request
    );
  }

  // ==================== Pools Operations ====================

  static async getPools(connector: string, network: string) {
    return gatewayGet<any[]>(
      `/pools?connector=${connector}&network=${network}`
    );
  }

  static async saveToken(
    address: string,
    chainNetwork: string
  ): Promise<{ message: string; token: any }> {
    return gatewayPost(
      `/tokens/save/${address}?chainNetwork=${chainNetwork}`,
      {}
    );
  }

  static async deleteToken(
    address: string,
    chain: string,
    network: string
  ): Promise<void> {
    return gatewayDelete(
      `/tokens/${address}?chain=${chain}&network=${network}`
    );
  }

  // ==================== Config Operations ====================

  static async getConfig() {
    return gatewayGet<any>('/config');
  }

  static async getChainConfigs() {
    return gatewayGet<any>('/config/chains');
  }

  static async getConnectorConfigs() {
    return gatewayGet<{ connectors: any[] }>('/config/connectors');
  }

  static async updateConfig(namespace: string, key: string, value: any) {
    return gatewayPost(`/config/${namespace}/${key}`, { value });
  }

  // ==================== Wallet Operations ====================

  static async getWallets(chain: string) {
    return gatewayGet<{ wallets: string[] }>(`/wallet?chain=${chain}`);
  }

  static async addWallet(chain: string, privateKey: string) {
    return gatewayPost('/wallet/add', { chain, privateKey });
  }
}
```

**Update all components** to use `GatewayAPI` instead of direct `gatewayGet`/`gatewayPost` calls for better type safety.

---

## Phase 5: Docker Compose Integration

### 5.1 Update docker-compose.yml

**Current**:
```yaml
services:
  gateway:
    restart: always
    container_name: gateway
    image: hummingbot/gateway:PR543
    ports:
      - "15888:15888"
    volumes:
      - ./conf:/home/gateway/conf
      - ./logs:/home/gateway/logs
      - ./certs:/home/gateway/certs
    environment:
      - GATEWAY_PASSPHRASE=a
      - DEV=true
```

**Proposed**:
```yaml
version: '3.8'

services:
  gateway:
    restart: always
    container_name: gateway
    image: hummingbot/gateway:PR543
    # Uncomment to build locally:
    # build:
    #   context: .
    #   dockerfile: Dockerfile
    ports:
      - "15888:15888"
    volumes:
      - ./conf:/home/gateway/conf
      - ./logs:/home/gateway/logs
      - ./certs:/home/gateway/certs
    environment:
      - GATEWAY_PASSPHRASE=${GATEWAY_PASSPHRASE:-a}
      - DEV=true
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:15888"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  gateway-app:
    container_name: gateway-app
    build:
      context: ./gateway-app
      dockerfile: Dockerfile.dev
    ports:
      - "5173:5173"  # Vite dev server
    volumes:
      - ./gateway-app/src:/app/src
      - ./gateway-app/public:/app/public
      - /app/node_modules  # Prevent overwriting
    environment:
      - VITE_GATEWAY_URL=http://gateway:15888
      - NODE_ENV=development
    depends_on:
      gateway:
        condition: service_healthy
    command: pnpm dev --host 0.0.0.0

networks:
  default:
    name: gateway-network
```

### 5.2 Create Dockerfile.dev for Gateway App

**Create** `gateway-app/Dockerfile.dev`:
```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install

# Copy source files
COPY . .

# Expose Vite dev server port
EXPOSE 5173

# Start dev server
CMD ["pnpm", "dev", "--host", "0.0.0.0"]
```

### 5.3 Add Production Docker Build

**Create** `gateway-app/Dockerfile`:
```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Production stage
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# Create nginx config for SPA routing
RUN echo 'server { \
  listen 80; \
  location / { \
    root /usr/share/nginx/html; \
    try_files $uri $uri/ /index.html; \
  } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### 5.4 Add docker-compose.prod.yml

**Create** `docker-compose.prod.yml`:
```yaml
version: '3.8'

services:
  gateway:
    restart: always
    container_name: gateway
    image: hummingbot/gateway:latest
    ports:
      - "15888:15888"
    volumes:
      - ./conf:/home/gateway/conf
      - ./logs:/home/gateway/logs
      - ./certs:/home/gateway/certs
    environment:
      - GATEWAY_PASSPHRASE=${GATEWAY_PASSPHRASE}
      - DEV=false
    healthcheck:
      test: ["CMD", "curl", "-f", "-k", "https://localhost:15888"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  gateway-app:
    container_name: gateway-app
    build:
      context: ./gateway-app
      dockerfile: Dockerfile
    ports:
      - "8080:80"
    environment:
      - VITE_GATEWAY_URL=https://localhost:15888
    depends_on:
      gateway:
        condition: service_healthy

networks:
  default:
    name: gateway-network
```

### 5.5 Usage Instructions

**Add to** `gateway-app/README.md`:
```markdown
## Docker Deployment

### Development Mode (with hot reload)
```bash
# Start both Gateway and Gateway-App in dev mode
docker-compose up

# Gateway API: http://localhost:15888
# Gateway App: http://localhost:5173
```

### Production Mode
```bash
# Build and start production containers
docker-compose -f docker-compose.prod.yml up -d

# Gateway API: https://localhost:15888
# Gateway App: http://localhost:8080
```

### Standalone Tauri App
```bash
cd gateway-app
pnpm install
pnpm tauri dev   # Development
pnpm tauri build # Production build
```
```

---

## Phase 6: Documentation (LOW PRIORITY)

### 6.1 Create Component Library Documentation

**Create** `gateway-app/docs/COMPONENTS.md`:
```markdown
# Gateway-App Component Library

This document describes reusable components for building Gateway clients.

## Common Components

### BaseModal
Generic modal wrapper with consistent styling...

### EmptyState
Displays empty state with optional action...

### LoadingState
Shows loading indicator...

## Form Components

### TokenSelector
Token dropdown with optional amount input and balance display...

### FormField
Labeled input field with error and help text support...

### ActionButtons
Dual-button layout for confirm/cancel actions...

## Usage Examples
[Include code examples for each component]
```

### 6.2 Create API Client Documentation

**Create** `gateway-app/docs/API-CLIENT.md`:
```markdown
# Gateway API Client Usage

Type-safe Gateway API client built on Gateway schemas.

## Installation

```typescript
import { GatewayAPI } from '@/lib/gateway-api';
import type { BalanceRequestType } from '@/lib/gateway-types';
```

## Examples

### Fetching Balances
```typescript
const balances = await GatewayAPI.getBalances('solana', {
  network: 'mainnet-beta',
  address: walletAddress,
});
```

### Router Swap Quote
```typescript
const quote = await GatewayAPI.quoteSwapRouter('jupiter', 'mainnet-beta', {
  baseToken: 'SOL',
  quoteToken: 'USDC',
  amount: 1.0,
  side: 'SELL',
});
```

[More examples...]
```

---

## Implementation Checklist

### Phase 1: Gateway Schemas (2-3 hours)
- [ ] Create `src/lib/gateway-types.ts` with re-exports
- [ ] Replace TokenInfo in utils.ts
- [ ] Replace Position interfaces in all view components
- [ ] Replace PoolInfo interfaces
- [ ] Replace QuoteResult in SwapView
- [ ] Replace ChainStatus in NetworkStatus
- [ ] Update all imports across components
- [ ] Test build to ensure no type errors

### Phase 2: Utility Functions (1-2 hours)
- [ ] Create `src/lib/utils/string.ts`
- [ ] Create `src/lib/utils/format.ts`
- [ ] Create `src/lib/utils/api-helpers.ts`
- [ ] Replace all capitalize() calls
- [ ] Replace all shortenAddress() patterns
- [ ] Replace all .toFixed() with formatTokenAmount()
- [ ] Replace all chainNetwork constructions
- [ ] Update component imports

### Phase 3: Reusable Components (3-4 hours)
- [ ] Create `src/components/common/BaseModal.tsx`
- [ ] Create `src/components/common/EmptyState.tsx`
- [ ] Create `src/components/common/LoadingState.tsx`
- [ ] Create `src/components/forms/TokenSelector.tsx`
- [ ] Create `src/components/forms/FormField.tsx`
- [ ] Create `src/components/common/ActionButtons.tsx`
- [ ] Refactor AddTokenModal to use BaseModal
- [ ] Refactor AddWalletModal to use BaseModal
- [ ] Refactor ConfirmModal to use BaseModal
- [ ] Replace empty states in all views
- [ ] Replace loading states in all views
- [ ] Refactor SwapView to use TokenSelector

### Phase 4: Typed API Client (2 hours)
- [ ] Create `src/lib/gateway-api.ts`
- [ ] Implement all chain operation methods
- [ ] Implement all CLMM operation methods
- [ ] Implement all router operation methods
- [ ] Implement config and wallet methods
- [ ] Update PortfolioView to use GatewayAPI
- [ ] Update SwapView to use GatewayAPI
- [ ] Update PoolsView to use GatewayAPI
- [ ] Update ConfigView to use GatewayAPI

### Phase 5: Docker Integration (1 hour)
- [ ] Update docker-compose.yml with gateway-app service
- [ ] Create gateway-app/Dockerfile.dev
- [ ] Create gateway-app/Dockerfile (production)
- [ ] Create docker-compose.prod.yml
- [ ] Test development Docker setup
- [ ] Test production Docker build
- [ ] Update README with Docker instructions

### Phase 6: Documentation (1 hour)
- [ ] Create docs/COMPONENTS.md
- [ ] Create docs/API-CLIENT.md
- [ ] Update main README.md
- [ ] Add inline JSDoc comments to utilities
- [ ] Add usage examples to component files

---

## Expected Outcomes

1. **Code Reduction**: ~30-40% reduction in total lines of code
2. **Type Safety**: 100% type-safe API calls (vs current 0%)
3. **Maintainability**: Single source of truth for types (Gateway schemas)
4. **Reusability**: 6+ reusable components for future features
5. **Developer Experience**: Clear examples for building on Gateway
6. **Deployment Options**: Support for Docker, Tauri desktop, and browser

---

## Testing Plan

After each phase:
1. Run `pnpm build` to ensure no TypeScript errors
2. Test all views in development mode
3. Verify API calls still work correctly
4. Check that UI behavior is unchanged
5. Test responsive layout on mobile/desktop

---

## Long-term Maintenance

- **Keep types synced**: When Gateway schemas change, update imports (not definitions)
- **Extract patterns**: When you notice repeated code, extract to utilities/components
- **Document examples**: Update docs when adding new features
- **Reference app**: This should be the gold standard for Gateway client development
