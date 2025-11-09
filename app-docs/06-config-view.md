# Config View (Admin Panel)

## Overview
The Config view provides an administrative interface for viewing and updating Gateway namespace configurations. Each chain network (e.g., `solana-mainnet-beta`, `ethereum-mainnet`) has its own namespace with configurable settings.

## UI Layout

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  Gateway                    [Wallet ▼] [Network ▼] [🌙/☀️]                    │
├───────────────────────────────────────────────────────────────────────────────┤
│  [Wallet] [Swap] [Pools] [Liquidity] [Configs]                                │
├──────────────────┬────────────────────────────────────────────────────────────┤
│  Namespaces      │  solana-mainnet-beta                                       │
│ ──────────────── │ ────────────────────────────────────────────────────────── │
│  SOLANA          │  ┌──────────────────────────────────────────────────────┐ │
│   devnet         │  │  Configuration Settings                              │ │
│ ►mainnet-beta    │  ├──────────────────────────────────────────────────────┤ │
│                  │  │                                                      │ │
│  ETHEREUM        │  │  nodeURL                                             │ │
│   arbitrum       │  │  ┌────────────────────────────────────────────────┐ │ │
│   avalanche      │  │  │ https://api.mainnet-beta.solana.com            │ │ │
│   base           │  │  └────────────────────────────────────────────────┘ │ │
│   bsc            │  │                                                      │ │
│   celo           │  │  nativeCurrencySymbol                                │ │
│   mainnet        │  │  ┌────────────────────────────────────────────────┐ │ │
│   optimism       │  │  │ SOL                                            │ │ │
│   polygon        │  │  └────────────────────────────────────────────────┘ │ │
│   sepolia        │  │                                                      │ │
│                  │  │  swapProvider                                        │ │
│                  │  │  ┌────────────────────────────────────────────────┐ │ │
│                  │  │  │ jupiter/router                                 │ │ │
│                  │  │  └────────────────────────────────────────────────┘ │ │
│                  │  │                                                      │ │
│                  │  │  [Save Changes]  [Reset]                            │ │
│                  │  │                                                      │ │
│                  │  └──────────────────────────────────────────────────────┘ │
│                  │                                                            │
└──────────────────┴────────────────────────────────────────────────────────────┘
```

## Features

### 1. Namespace Sidebar
**Purpose**: Browse and select network namespaces to configure

#### Layout
- **Left sidebar**: 256px wide (w-64)
- **Grouped by chain**: Solana and Ethereum sections
- **Network names**: Display network portion only (e.g., "mainnet-beta" instead of "solana-mainnet-beta")
- **Active indicator**: Selected namespace highlighted with accent background

#### Namespace List
**Solana Namespaces**:
- devnet
- mainnet-beta

**Ethereum Namespaces**:
- arbitrum
- avalanche
- base
- bsc
- celo
- mainnet
- optimism
- polygon
- sepolia

#### Behavior
- Click any namespace to load its configuration
- Currently selected namespace shown with accent background and bold font
- Hover effect on all namespace items
- Scrollable if list exceeds viewport height

### 2. Configuration Editor

#### Field Types
1. **Text Input**: For strings (URLs, symbols, paths)
2. **Number Input**: For numeric values (timeouts, limits)
3. **Boolean Toggle**: For true/false settings
4. **Dropdown**: For enum values with predefined options

#### Common Configuration Fields

**Solana Networks**:
- `nodeURL` - RPC endpoint URL
- `tokenListType` - FILE or URL
- `tokenListSource` - Path or URL to token list
- `nativeCurrencySymbol` - SOL
- `transactionTimeoutSeconds` - Timeout for transactions
- `commitment` - confirmed, finalized, processed
- `computeUnitLimit` - Maximum compute units
- `computeUnitPrice` - Price per compute unit

**Ethereum Networks**:
- `nodeURL` - RPC endpoint URL
- `tokenListType` - FILE or URL
- `tokenListSource` - Path or URL to token list
- `nativeCurrencySymbol` - ETH, BNB, MATIC, etc.
- `chainID` - Network chain ID
- `gasLimitTransaction` - Gas limit for transactions
- `gasPriceRefreshInterval` - Interval for gas price updates
- `maxFeePerGas` - Maximum fee per gas unit
- `maxPriorityFeePerGas` - Maximum priority fee

### 3. Actions

#### Save Changes
- Only enabled when changes have been made
- POST to `/config/update` with namespace and updated values
- Shows success message (auto-dismisses after 3 seconds)
- Updates original config to new saved state
- Disabled during save operation

#### Reset
- Only enabled when changes have been made
- Discards all unsaved changes
- Returns all fields to last saved state from server
- Clears success/error messages
- Disabled during save operation

### 4. Validation

#### Field-Level Validation
- **URLs**: Must be valid HTTP/HTTPS URLs
- **Numbers**: Must be positive integers or floats
- **Required Fields**: Cannot be empty
- **Enums**: Must be one of allowed values

#### Form-Level Validation
- All required fields must be filled
- All fields must pass validation
- Save button disabled if any validation errors

#### Error Display
- Inline error messages below invalid fields
- Red border on invalid inputs
- Error summary at top of form if multiple errors

## State Management

### Local State
- `namespaces`: Array of all network namespace strings
- `selectedNamespace`: Currently selected namespace (e.g., "solana-mainnet-beta")
- `config`: Object containing all configuration key-value pairs for selected namespace
- `originalConfig`: Backup for reset functionality
- `allConfigs`: Object containing all configs (keyed by namespace)
- `loading`: Loading state for initial fetch
- `saving`: Loading state for save operation
- `error`: Error message string
- `successMessage`: Success message string

### Computed Values
- `hasChanges = JSON.stringify(config) !== JSON.stringify(originalConfig)`
- `solanaNamespaces = namespaces.filter(ns => ns.startsWith('solana-'))`
- `ethereumNamespaces = namespaces.filter(ns => ns.startsWith('ethereum-'))`

## API Endpoints

### GET `/config/namespaces`
Fetches list of all available namespaces:
```bash
GET /config/namespaces
```

Response:
```json
{
  "namespaces": [
    "ethereum-mainnet",
    "ethereum-arbitrum",
    "solana-mainnet-beta",
    "solana-devnet",
    ...
  ]
}
```

### GET `/config`
Fetches all configuration including all namespace configs:
```bash
GET /config
```

Response (excerpt):
```json
{
  "solana-mainnet-beta": {
    "nodeURL": "https://api.mainnet-beta.solana.com",
    "nativeCurrencySymbol": "SOL",
    "swapProvider": "jupiter/router",
    "defaultComputeUnits": 200000
  },
  "ethereum-mainnet": {
    "chainID": 1,
    "nodeURL": "https://eth.llamarpc.com",
    "nativeCurrencySymbol": "ETH",
    "swapProvider": "uniswap/router"
  },
  ...
}
```

### POST `/config/update`
Updates configuration for a namespace:
```json
{
  "namespace": "solana-mainnet-beta",
  "nodeURL": "https://new-rpc-endpoint.com",
  "commitment": "finalized"
}
```

Response:
```json
{
  "success": true,
  "namespace": "solana-mainnet-beta",
  "updatedFields": ["nodeURL", "commitment"]
}
```

### GET `/config/chains`
Gets available chains and networks (reused from wallet selector):
```json
{
  "chains": [
    {
      "chain": "solana",
      "networks": ["devnet", "mainnet-beta"],
      "defaultNetwork": "mainnet-beta"
    },
    {
      "chain": "ethereum",
      "networks": ["arbitrum", "avalanche", ...],
      "defaultNetwork": "mainnet"
    }
  ]
}
```

## User Workflows

### Viewing Configuration
1. Click "Config" tab
2. Page loads with default chain/network (Solana mainnet-beta)
3. Configuration fields populate from API
4. User can view all settings

### Changing Configuration
1. Select chain and network to configure
2. Modify field values
3. Click "Save Changes"
4. System validates all fields
5. If valid, sends update to API
6. Shows success message
7. Updates `originalConfig` to new values

### Discarding Changes
1. Make changes to fields
2. Click "Reset" button
3. All fields revert to `originalConfig` values
4. `hasChanges` becomes false

### Switching Namespaces with Unsaved Changes
1. User modifies config fields
2. User changes chain or network dropdown
3. System detects unsaved changes
4. Shows confirmation dialog: "You have unsaved changes. Discard them?"
5. If confirmed: Load new namespace config
6. If cancelled: Keep current namespace selected

## Security Considerations

### Sensitive Fields
- Private keys and API keys should be masked with password input type
- Show/hide toggle for viewing sensitive values
- Never log sensitive values to console

### Validation
- Strict validation on URLs to prevent injection
- Numeric bounds checking
- Enum validation against allowed values

### Permissions
- Config changes should require authentication
- Consider read-only mode for non-admin users
- Audit log for configuration changes (future feature)

## Implementation Files
- `/gateway-app/src/components/ConfigView.tsx` - Main config view component
- `/gateway-app/src/lib/api.ts` - API functions for fetching/updating config
- `/gateway-app/src/App.tsx` - Add Config tab to main navigation

## Future Enhancements
1. **Config Templates**: Preset configurations for common setups
2. **Bulk Edit**: Change multiple namespaces at once
3. **Diff View**: Show what changed before saving
4. **Audit Log**: Track who changed what and when
5. **Export/Import**: Download/upload configs as JSON
6. **Schema Validation**: Dynamic field types from JSON schema
7. **Advanced Mode**: Toggle to show all fields vs. common fields only
