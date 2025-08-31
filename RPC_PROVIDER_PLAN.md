# RPC Provider Abstraction Plan

## Overview
Implement a clean RPC provider abstraction that allows switching between different RPC services (standard URL, Helius, QuickNode, Alchemy, etc.) while maintaining backward compatibility and reusing existing code.

## Architecture

### Directory Structure
```
src/
├── templates/
│   ├── rpc/                     # RPC provider templates
│   │   ├── helius.yml           # Helius provider config
│   │   ├── quicknode.yml        # QuickNode provider config (future)
│   │   └── alchemy.yml          # Alchemy provider config (future)
│   └── namespace/
│       ├── rpc-schema.json      # NEW: Schema for RPC provider configs
│       └── ...existing schemas
├── chains/
│   └── solana/
│       ├── helius-service.ts    # Keep existing implementation
│       ├── solana.ts            # Add rpcProvider check
│       └── solana.config.ts     # Add rpcProvider field
gateway-setup.sh                 # Update to include rpc folder
```

## Configuration Structure

### 1. Network Configuration
Update `src/templates/chains/solana/mainnet-beta.yml`:
```yaml
nodeURL: https://api.mainnet-beta.solana.com
nativeCurrencySymbol: SOL
rpcProvider: 'helius'  # NEW: 'url' | 'helius' | 'quicknode' etc.

# Common configs remain unchanged
defaultComputeUnits: 200000
confirmRetryInterval: 1
confirmRetryCount: 10
minPriorityFeePerCU: 0.01

# Remove Helius-specific fields (moved to helius.yml)
# - heliusAPIKey
# - useHeliusRestRPC
# - useHeliusWebSocketRPC
# - useHeliusSender
# - heliusRegionCode
# - jitoTipSOL
```

### 2. Provider Configuration
Create `src/templates/rpc/helius.yml`:
```yaml
# Helius RPC Provider Configuration
apiKey: ''  # Get from https://helius.dev
# Note: useRestRPC removed - if using Helius provider, always use Helius RPC
useWebSocketRPC: true
useSender: true
regionCode: 'slc'  # slc, ewr, lon, fra, ams, sg, tyo
jitoTipSOL: 0.001  # Minimum 0.001 SOL for Jito bundles
```

**Important change from current implementation:**
- Remove `useRestRPC` parameter entirely
- When `rpcProvider: 'helius'` is set, ALWAYS use Helius RPC endpoint
- Simplifies configuration - choosing Helius means using Helius RPC

## Implementation Plan

### Phase 1: Add Provider Field
1. **Update `solana.config.ts`**:
   - Add `rpcProvider: string` field
   - Keep interface backward compatible

2. **Update network config templates**:
   - Add `rpcProvider: 'url'` as default
   - Keep existing nodeURL field

### Phase 2: Create Provider Templates
1. **Create `src/templates/rpc/` directory**
2. **Add `helius.yml`** with Helius-specific configs
3. **Update config namespace** to include rpc providers

### Phase 3: Update Solana Connector
1. **Modify Solana constructor**:
   ```typescript
   constructor(network: string) {
     this.network = network;
     this.config = getSolanaNetworkConfig(network);
     
     // Check rpcProvider
     if (this.config.rpcProvider === 'helius') {
       this.initializeHeliusProvider();
     } else {
       // Default: use nodeURL
       this.connection = new Connection(this.config.nodeURL);
     }
   }
   
   private initializeHeliusProvider() {
     // Load Helius config from rpc/helius.yml
     const heliusConfig = ConfigManagerV2.getInstance().get('rpc.helius');
     
     // Merge configs for HeliusService
     const mergedConfig = {
       ...this.config,
       heliusAPIKey: heliusConfig.apiKey,
       useHeliusRestRPC: true,  // Always true when using Helius provider
       useHeliusWebSocketRPC: heliusConfig.useWebSocketRPC,
       useHeliusSender: heliusConfig.useSender,
       heliusRegionCode: heliusConfig.regionCode,
       jitoTipSOL: heliusConfig.jitoTipSOL
     };
     
     // Always use Helius RPC URL when Helius provider is selected
     if (heliusConfig.apiKey) {
       const rpcUrl = this.network.includes('devnet')
         ? `https://devnet.helius-rpc.com/?api-key=${heliusConfig.apiKey}`
         : `https://mainnet.helius-rpc.com/?api-key=${heliusConfig.apiKey}`;
       this.connection = new Connection(rpcUrl);
     } else {
       this.connection = new Connection(this.config.nodeURL);
     }
     
     // Initialize HeliusService with merged config
     this.heliusService = new HeliusService(mergedConfig);
   }
   ```

### Phase 4: Testing
1. Test with `rpcProvider: 'url'` (default behavior)
2. Test with `rpcProvider: 'helius'` (Helius features)
3. Verify backward compatibility
4. Test provider switching

### Phase 5: Cleanup
1. Remove Helius-specific fields from network configs
2. Update documentation
3. Add migration notes for existing users

## Benefits

### Current Benefits
- **Minimal changes**: Reuses existing HeliusService without modification
- **Clean separation**: Provider configs in dedicated files
- **Backward compatible**: Defaults to 'url' if not specified
- **Easy configuration**: Users only need to set provider name and configure provider file

### Future Benefits
- **Extensible**: Add new providers by creating new yml files
- **Cross-chain ready**: Same pattern works for Ethereum
- **Maintainable**: Provider-specific logic isolated

## Future Extensions

### Adding New Providers
To add QuickNode support:
1. Create `src/templates/rpc/quicknode.yml`
2. Add QuickNode service class if needed
3. Update Solana constructor with QuickNode case

### Ethereum Support
Same pattern for Ethereum:
```yaml
# ethereum/mainnet.yml
nodeURL: https://mainnet.infura.io/v3/xxx
rpcProvider: 'alchemy'  # or 'infura', 'url'

# rpc/alchemy.yml
apiKey: 'xxx'
network: 'eth-mainnet'
```

## Migration Guide

### For Existing Users
1. Existing configs continue to work (backward compatible)
2. To use Helius:
   - Set `rpcProvider: 'helius'` in network config
   - Move API key to `conf/rpc/helius.yml`
   - Remove Helius fields from network config

### Configuration Examples

#### Standard RPC (default):
```yaml
# solana/mainnet-beta.yml
rpcProvider: 'url'
nodeURL: https://api.mainnet-beta.solana.com
```

#### Helius RPC:
```yaml
# solana/mainnet-beta.yml
rpcProvider: 'helius'
nodeURL: https://api.mainnet-beta.solana.com  # Fallback

# rpc/helius.yml
apiKey: 'your-api-key'
useRestRPC: true
useWebSocketRPC: true
useSender: true
```

## Additional Infrastructure Changes

### 1. Namespace Schema
Create `src/templates/namespace/helius-schema.json`:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "apiKey": { 
      "type": "string",
      "description": "Helius API key from https://helius.dev"
    },
    "useWebSocketRPC": { 
      "type": "boolean",
      "description": "Use Helius WebSocket for transaction monitoring"
    },
    "useSender": { 
      "type": "boolean",
      "description": "Use Helius Sender endpoint for faster transaction delivery"
    },
    "regionCode": { 
      "type": "string",
      "enum": ["slc", "ewr", "lon", "fra", "ams", "sg", "tyo"],
      "description": "Regional endpoint for Helius Sender"
    },
    "jitoTipSOL": { 
      "type": "number",
      "minimum": 0.001,
      "description": "Jito tip amount in SOL for bundle inclusion"
    }
  },
  "required": ["apiKey"],
  "additionalProperties": false
}
```

**Note:** `useRestRPC` field removed from schema - using Helius provider always means using Helius RPC

Future providers will have their own schemas:
- `src/templates/namespace/quicknode-schema.json`
- `src/templates/namespace/alchemy-schema.json`
- etc.

### 2. Setup Script Updates
Update `gateway-setup.sh`:
- Add new prompt for RPC provider configs
- Copy `src/templates/rpc/` to `conf/rpc/`
- Include in both interactive and `--with-defaults` modes

```bash
# Add to ask_config_choices()
if prompt_yes_no "  - rpc/ (RPC provider configurations)?" "Y"; then
  UPDATE_RPC="Y"
  PLANNED_UPDATES="${PLANNED_UPDATES}rpc/, "
else
  UPDATE_RPC="N"
fi

# Add to copy_configs()
if [ "$UPDATE_RPC" = "Y" ]; then
  cp -r $TEMPLATE_DIR/rpc $HOST_CONF_PATH/
  UPDATED_ITEMS="${UPDATED_ITEMS}rpc/, "
fi
```

### 3. Config Manager Updates
Update `ConfigManagerV2` to:
- Register `rpc` namespace
- Load RPC provider configs from `conf/rpc/`
- Similar to how `tokens/` and `pools/` are handled

### 4. Build Process
Update build scripts:
- Include `src/templates/rpc/*.yml` in copy-files task
- Similar to tokens and pools handling

## Implementation Timeline

1. **Day 1**: 
   - Add rpcProvider field to configs
   - Create RPC templates and schema
   - Update setup script

2. **Day 2**: 
   - Update Solana connector logic
   - Test provider loading

3. **Day 3**: 
   - Testing and validation
   - Update build process

4. **Day 4**: 
   - Documentation and migration guide
   - Clean up old fields

5. **Day 5**: 
   - Deploy and monitor
   - User feedback

## Success Criteria

- [ ] Existing configs work without changes
- [ ] Can switch between 'url' and 'helius' providers
- [ ] Helius features work as before
- [ ] Clean separation of provider configs
- [ ] Setup script includes RPC configs
- [ ] Namespace validation for RPC configs
- [ ] Build process includes RPC templates
- [ ] Easy to add new providers