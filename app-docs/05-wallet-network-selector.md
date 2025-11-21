# Wallet & Network Selector

## Overview
The header contains wallet and network selection controls that allow users to switch between different wallets, chains, and networks.

## UI Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Gateway                    [Wallet ▼] [Network ▼] [🌙/☀️]              │
└─────────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Wallet Selector
**Location**: Header, center-right
**Width**: 256px (w-64)

#### Visual Structure
```
┌──────────────────────────────────────────┐
│ ◎ 0x1234...5678                       ▼ │  <- Selected wallet with chain icon
└──────────────────────────────────────────┘

Dropdown (when clicked):
┌──────────────────────────────────────────┐
│ SOLANA                                   │  <- Chain heading (optgroup)
│   ◎ 0x1234...5678                        │  <- Solana wallet
│   ◎ 0xabcd...efgh                        │  <- Another Solana wallet
├──────────────────────────────────────────┤
│ ETHEREUM                                 │  <- Chain heading (optgroup)
│   ⟠ 0x9876...4321                        │  <- Ethereum wallet
│   ⟠ 0x2468...1357                        │  <- Another Ethereum wallet
├──────────────────────────────────────────┤
│ + Add Wallet                             │  <- Add new wallet option
└──────────────────────────────────────────┘
```

#### Chain Icons
- **Solana**: `◎` (circle with horizontal line)
- **Ethereum**: `⟠` (diamond shape)

#### States
- **No wallets**: Shows only "+ Add Wallet"
- **Has wallets**: Shows grouped wallets by chain + "+ Add Wallet" at bottom

#### Behavior
- Selecting a wallet from different chain automatically switches the active chain
- Switching chains triggers network selector to update to that chain's default network
- Wallet addresses are truncated: `first6chars...last4chars`

### 2. Network Selector
**Location**: Header, right of wallet selector
**Width**: 192px (w-48)

#### Visual Structure
```
┌──────────────────────────┐
│ mainnet-beta          ▼ │  <- Current network
└──────────────────────────┘

Dropdown (Solana example):
┌──────────────────────────┐
│ devnet                   │
│ mainnet-beta             │  <- Currently selected
└──────────────────────────┘

Dropdown (Ethereum example):
┌──────────────────────────┐
│ arbitrum                 │
│ avalanche                │
│ base                     │
│ bsc                      │
│ celo                     │
│ mainnet                  │  <- Currently selected
│ optimism                 │
│ polygon                  │
│ sepolia                  │
└──────────────────────────┘
```

#### Behavior
- Networks are fetched from `/config/chains` API endpoint
- When chain changes (via wallet selection), network auto-switches to chain's `defaultNetwork`
- Networks are sorted alphabetically
- Default networks:
  - Solana: `mainnet-beta`
  - Ethereum: `mainnet`

### 3. Theme Toggle
**Location**: Header, rightmost
**Size**: 20x20px icon in 32x32px button

#### Icons
- **Light mode**: 🌙 Moon icon (click to switch to dark)
- **Dark mode**: ☀️ Sun icon (click to switch to light)

#### Behavior
- Toggles between light and dark theme
- Preference saved to localStorage
- Applies `.dark` class to document root
- Initializes from localStorage or system preference on first load

## Add Wallet Modal

### Visual Structure
```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  ┌────────────────────────────────────────────┐    │
│  │  Add Wallet                                │    │
│  ├────────────────────────────────────────────┤    │
│  │                                            │    │
│  │  Chain                                     │    │
│  │  ┌──────────────────────────────────────┐ │    │
│  │  │ Ethereum                          ▼  │ │    │
│  │  └──────────────────────────────────────┘ │    │
│  │                                            │    │
│  │  Private Key                               │    │
│  │  ┌──────────────────────────────────────┐ │    │
│  │  │ ••••••••••••••••••••••••••••••••••   │ │    │
│  │  └──────────────────────────────────────┘ │    │
│  │                                            │    │
│  │  ┌──────────────┐  ┌──────────────┐      │    │
│  │  │  Add Wallet  │  │    Cancel    │      │    │
│  │  └──────────────┘  └──────────────┘      │    │
│  └────────────────────────────────────────────┘    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Fields
1. **Chain Dropdown**
   - Options: Ethereum, Solana
   - Pre-selected to current active chain

2. **Private Key Input**
   - Type: password (masked)
   - Placeholder: "Enter private key"
   - Disabled during submission

3. **Actions**
   - Add Wallet: Submits form
   - Cancel: Closes modal

### Behavior
1. User clicks "+ Add Wallet" from wallet selector
2. Modal opens with chain pre-selected to current chain
3. User selects chain and enters private key
4. On submit:
   - POST to `/wallet/add` with `{chain, privateKey}`
   - Reloads all wallets
   - Selects newly added wallet
   - Switches to the wallet's chain
   - Shows success alert
   - Closes modal
5. On error: Shows error alert, keeps modal open

## API Endpoints Used

### GET `/wallet`
Returns all wallets grouped by chain:
```json
[
  {
    "chain": "solana",
    "walletAddresses": ["address1", "address2"]
  },
  {
    "chain": "ethereum",
    "walletAddresses": ["address3", "address4"]
  }
]
```

### GET `/config/chains`
Returns available chains with networks and defaults:
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
      "networks": ["arbitrum", "avalanche", "base", "bsc", "celo", "mainnet", "optimism", "polygon", "sepolia"],
      "defaultNetwork": "mainnet"
    }
  ]
}
```

### POST `/wallet/add`
Adds a new wallet:
```json
{
  "chain": "ethereum",
  "privateKey": "0x..."
}
```

## State Management

### AppContext State
- `selectedChain`: Current active chain (solana/ethereum)
- `selectedNetwork`: Current network for active chain
- `selectedWallet`: Current wallet address
- `theme`: Current theme (light/dark)

### Local Component State (App.tsx)
- `allWallets`: Array of wallet data grouped by chain
- `networks`: Array of available networks for current chain
- `defaultNetwork`: Default network for current chain
- `showAddWallet`: Boolean for modal visibility

## Implementation Files
- `/gateway-app/src/components/WalletSelector.tsx` - Wallet dropdown component
- `/gateway-app/src/components/AddWalletModal.tsx` - Add wallet modal
- `/gateway-app/src/lib/AppContext.tsx` - Global state management
- `/gateway-app/src/App.tsx` - Header with selectors and theme toggle
