# Ledger Hardware Wallet Integration Plan for Gateway

## Overview
This document outlines the plan to integrate Ledger hardware wallet support into Gateway, focusing initially on Jupiter (Solana) integration.

## Architecture

### Core Components

1. **Hardware Wallet Service** (`/src/services/hardware-wallet-service.ts`)
   - Singleton service to manage Ledger connections
   - Handle device discovery and connection lifecycle
   - Abstract transport layer for future hardware wallet support

2. **Ledger Transport Manager** (`/src/services/ledger-transport.ts`)
   - Manage USB connections using `@ledgerhq/hw-transport-node-hid`
   - Handle connection errors and retries
   - Implement device locking to prevent concurrent access

3. **Chain-specific Implementations**
   - Solana Ledger integration (`/src/chains/solana/solana-ledger.ts`)
   - Future: Ethereum Ledger integration

### Data Model

Hardware wallets will be stored in dedicated files:
```
/conf/wallets/
  /solana/
    hardware-wallets.json
  /ethereum/
    hardware-wallets.json (future)
```

Structure:
```json
{
  "wallets": [
    {
      "address": "5FHwkrdxntdK24hgQU8qgBjn35Y1zwhz1GZwCkP2UJnM",
      "publicKey": "5FHwkrdxntdK24hgQU8qgBjn35Y1zwhz1GZwCkP2UJnM",
      "derivationPath": "44'/501'/0'",
      "deviceId": "ledger-nano-s-1234",
      "name": "Ledger Wallet 1",
      "addedAt": "2025-01-10T12:00:00Z"
    }
  ]
}
```

## API Routes

### 1. List Hardware Wallets
**GET** `/wallet/hardware`
- Query params: `chain` (required)
- Returns list of hardware wallets for the specified chain

### 2. Add Hardware Wallet
**POST** `/wallet/hardware/add`
- Body:
  ```json
  {
    "chain": "solana",
    "derivationPath": "44'/501'/0'", // optional, defaults to standard path
    "name": "My Ledger" // optional
  }
  ```
- Flow:
  1. Connect to Ledger device
  2. Retrieve public key/address
  3. Store in hardware-wallets.json
  4. Return wallet details

### 3. Remove Hardware Wallet
**DELETE** `/wallet/hardware/remove`
- Body:
  ```json
  {
    "chain": "solana",
    "address": "5FHwkrdxntdK24hgQU8qgBjn35Y1zwhz1GZwCkP2UJnM"
  }
  ```

### 4. List Connected Devices
**GET** `/wallet/hardware/devices`
- Returns list of connected Ledger devices

## Integration Points

### 1. Solana Class Modifications
- Add `isHardwareWallet(address: string): Promise<boolean>`
- Modify transaction signing to detect hardware wallets
- Route hardware wallet signatures through Ledger service

### 2. Jupiter ExecuteQuote Flow
- Detect if `walletAddress` is a hardware wallet
- Prepare transaction for Ledger signing
- Display "Please confirm on your Ledger device" message
- Wait for user confirmation on device
- Return signed transaction

### 3. Transaction Signing Flow
```typescript
// In Jupiter executeQuote
if (await solana.isHardwareWallet(walletAddress)) {
  const hardwareWalletService = HardwareWalletService.getInstance();
  const signedTx = await hardwareWalletService.signTransaction(
    'solana',
    walletAddress,
    transaction,
    {
      timeout: 60000, // 60 second timeout for user to confirm
      displayMessage: 'Please confirm the transaction on your Ledger device'
    }
  );
  return signedTx;
} else {
  // Regular wallet signing flow
}
```

## Implementation Phases

### Phase 1: Core Infrastructure (Current Focus)
1. Create hardware wallet service
2. Implement Ledger transport manager
3. Add API routes for wallet management
4. Create storage layer for hardware wallets

### Phase 2: Solana Integration
1. Implement Solana Ledger signing
2. Integrate with Jupiter executeQuote
3. Add proper error handling and user feedback

### Phase 3: Testing & Polish
1. Add comprehensive tests
2. Handle edge cases (device disconnection, timeout, etc.)
3. Add detailed logging

### Phase 4: Ethereum Support (Future)
1. Implement Ethereum Ledger signing
2. Integrate with Uniswap and 0x

## Dependencies

```json
{
  "@ledgerhq/hw-transport-node-hid": "^6.28.4",
  "@ledgerhq/hw-transport-node-hid-singleton": "^6.28.4",
  "@ledgerhq/hw-app-solana": "^7.1.0",
  "@ledgerhq/hw-app-eth": "^6.29.0"
}
```

## Error Handling

1. **Device Not Connected**: Clear error message with instructions
2. **Transaction Rejected**: User rejected on device
3. **Timeout**: User didn't respond within timeout period
4. **Wrong Device**: Connected device doesn't have the expected address
5. **Device Locked**: Prompt user to unlock device

## Security Considerations

1. Never store private keys or seed phrases
2. All signing happens on the hardware device
3. Implement request signing to prevent replay attacks
4. Add rate limiting to prevent spam
5. Clear transaction data display before signing

## User Experience

1. **Clear Instructions**: Show step-by-step guidance
2. **Device Status**: Show connection status in API responses
3. **Progress Feedback**: Show "Waiting for confirmation" status
4. **Error Recovery**: Allow retry on failure
5. **Device Management**: Easy add/remove wallet flow

## Testing Strategy

1. **Unit Tests**: Mock Ledger transport for testing
2. **Integration Tests**: Use Ledger simulator if available
3. **Manual Testing**: Test with real Ledger device
4. **Error Scenarios**: Test all failure modes

## Success Criteria

1. User can add a Ledger wallet to Gateway
2. User can execute Jupiter swaps using Ledger wallet
3. Transaction details are clearly displayed on Ledger device
4. Proper error handling for all failure scenarios
5. Clean API design consistent with existing Gateway patterns