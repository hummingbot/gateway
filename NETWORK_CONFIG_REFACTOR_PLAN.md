### Plan for Per-Network Configuration Refactor

The current system defines network configurations within a single chain-specific file (e.g., `ethereum.yml`, `solana.yml`). This plan outlines the steps to refactor this into a more modular system where each network has its own configuration file.

#### 1. New Directory Structure for Network Configs

- Create a new directory structure to house the network-specific configuration files.
- The new structure will be `conf/chains/<chain_name>/<network_name>.yml`.
- For example:
    - `conf/chains/ethereum/mainnet.yml`
    - `conf/chains/ethereum/arbitrum.yml`
    - `conf/chains/solana/mainnet-beta.yml`

#### 2. New JSON Schemas for Network Configuration

- Create a new JSON schema for network-specific configurations. This schema will define the properties that can be set for each network.
- The new schema file will be `src/templates/json/network_config.json`.
- This schema will include properties like `nodeURL`, `tokenListType`, `tokenListSource`, `nativeCurrencySymbol`, and other network-specific settings.
- Update the existing chain-specific schemas (`ethereum_config.json`, `solana_config.json`) to remove the `networks` property and instead reference the new `network_config.json` schema.

#### 3. Update `config-manager-v2.ts`

- Modify the `ConfigManagerV2` class to support the new network-centric configuration structure.
- The `loadConfigRoot` method will need to be updated to scan the `conf/chains` directory for network configuration files and dynamically load them as namespaces.
- The namespace for a network configuration will be in the format `<chain_name>.<network_name>`. For example, `ethereum.mainnet`.
- The `get` and `set` methods will need to be updated to handle the new namespace format.

#### 4. Update `gateway-setup.sh`

- The `gateway-setup.sh` script will need to be updated to create the new directory structure for network configurations.
- The script will also need to copy the new network configuration templates to the `conf/chains` directory.

#### 5. Create Network Configuration Templates

- Create new template files for each network. These templates will be located in `src/templates/chains/<chain_name>/<network_name>.yml`.
- For example:
    - `src/templates/chains/ethereum/mainnet.yml`
    - `src/templates/chains/ethereum/arbitrum.yml`
    - `src/templates/chains/solana/mainnet-beta.yml`
- These templates will contain the default settings for each network.

#### 6. Update Routes and Services

- Update any routes and services that currently rely on the old configuration system to use the new network-centric system.
- This will involve changing how configuration values are retrieved, using the new namespace format.

### To-Do List

1.  **Create New Directory Structure:**
    -   [ ] Create `conf/chains/ethereum`
    -   [ ] Create `conf/chains/solana`

2.  **Create New JSON Schemas:**
    -   [ ] Create `src/templates/json/ethereum_network_config.json`
    -   [ ] Create `src/templates/json/solana_network_config.json`
    -   [ ] Update `src/templates/json/ethereum_config.json` to remove the `networks` property.
    -   [ ] Update `src/templates/json/solana_config.json` to remove the `networks` property.

3.  **Update `config-manager-v2.ts`:**
    -   [ ] Modify `loadConfigRoot` to scan for and load network configurations.
    -   [ ] Update `get` and `set` to handle the new namespace format.

4.  **Update `gateway-setup.sh`:**
    -   [ ] Add commands to create the new directory structure.
    -   [ ] Add commands to copy the new network configuration templates.

5.  **Create Network Configuration Templates:**
    -   [ ] Create templates for each Ethereum network in `src/templates/chains/ethereum/`.
    -   [ ] Create templates for each Solana network in `src/templates/chains/solana/`.

6.  **Update Routes and Services:**
    -   [ ] Identify and update all code that accesses network-specific configurations.
