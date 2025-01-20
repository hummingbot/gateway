# you need to install to programs: curl and envsubst

# You must the following values in your command line
# export ETH_ADDRESS='<put-your-public-key-here>'
# export AVALANCHE_ADDRESS='<put-your-public-key-here>'
# export BSC_ADDRESS='put-your-binance-smart-chain-key-here'
# export POLYGON_ADDRESS='<put-your-public-key-here>'
# export KUJIRA_MNEMONIC='put-your-kujira-mnemonic-here'
# export OSMOSIS_ADDRESS='<put-your-osmosis-public-key-here>'
# export OSMOSIS_PRIVATE_KEY='<put-your-osmosis-test-private-key-here>'

# -k is --insecure, this disables certificate verification and should only be
# used for local development and testing

# Config

curl -s -X GET -k --key $GATEWAY_KEY --cert $GATEWAY_CERT https://localhost:15888/ | jq

curl -s -X GET -k --key $GATEWAY_KEY --cert $GATEWAY_CERT https://localhost:15888/connectors | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/config_update.json)" https://localhost:15888/config/update | jq

# Network

curl -s -X GET -k --key $GATEWAY_KEY --cert $GATEWAY_CERT https://localhost:15888/chain/status | jq

curl -s -X GET -k --key $GATEWAY_KEY --cert $GATEWAY_CERT "https://localhost:15888/chain/status?chain=ethereum&network=goerli" | jq

curl -s -X GET -k --key $GATEWAY_KEY --cert $GATEWAY_CERT "https://localhost:15888/chain/status?chain=avalanche&network=avalanche" | jq

curl -s -X GET -k --key $GATEWAY_KEY --cert $GATEWAY_CERT "https://localhost:15888/chain/status?chain=harmony&network=harmony" | jq

curl -s -X GET -k --key $GATEWAY_KEY --cert $GATEWAY_CERT "https://localhost:15888/chain/status?chain=cronos&network=mainnet" | jq

curl -s -X GET -k --key $GATEWAY_KEY --cert $GATEWAY_CERT "https://localhost:15888/chain/status?chain=algorand&network=mainnet" | jq

curl -s -X GET -k --key $GATEWAY_KEY --cert $GATEWAY_CERT "https://localhost:15888/chain/status?chain=ton&network=mainnet" | jq

curl -s -X GET -k --key $GATEWAY_KEY --cert $GATEWAY_CERT https://localhost:15888/chain/config | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/network_poll.json)" https://localhost:15888/chain/poll | jq

curl -s -X GET -k --key $GATEWAY_KEY --cert $GATEWAY_CERT "https://localhost:15888/chain/tokens?chain=ethereum&network=goerli" | jq

curl -s -X GET -k --key $GATEWAY_KEY --cert $GATEWAY_CERT "https://localhost:15888/chain/tokens?chain=polygon&network=mainnet" | jq

curl -s -X GET -k --key $GATEWAY_KEY --cert $GATEWAY_CERT "https://localhost:15888/chain/tokens?chain=polygon&network=mumbai" | jq

curl -s -X GET -k --key $GATEWAY_KEY --cert $GATEWAY_CERT "https://localhost:15888/chain/tokens?chain=cronos&network=mainnet" | jq

curl -s -X GET -k --key $GATEWAY_KEY --cert $GATEWAY_CERT "https://localhost:15888/chain/tokens?chain=xdc&network=xinfin" | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/network_balances.json)" https://localhost:15888/chain/balances | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/bsc_balances.json)" https://localhost:15888/chain/balances | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/cronos_balances.json)" https://localhost:15888/chain/balances | jq

curl -s -X GET -k --key $GATEWAY_KEY --cert $GATEWAY_CERT "https://localhost:15888/chain/status?chain=osmosis&network=testnet" | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/osmosis_balances.json)" https://localhost:15888/chain/poll | jq

curl -s -X GET -k --key $GATEWAY_KEY --cert $GATEWAY_CERT "https://localhost:15888/chain/tokens?chain=osmosis&network=testnet" | jq

# Wallet

## add private keys
curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/add_algorand_key.json)" https://localhost:15888/wallet/add | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/add_ethereum_key.json)" https://localhost:15888/wallet/add | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/add_avalanche_key.json)" https://localhost:15888/wallet/add | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/add_cronos_key.json)" https://localhost:15888/wallet/add | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/add_bsc_key.json)" https://localhost:15888/wallet/add | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/add_polygon_key.json)" https://localhost:15888/wallet/add | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/add_xdc_key.json)" https://localhost:15888/wallet/add | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/add_kujira_key.json)" https://localhost:15888/wallet/add | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/add_osmosis_key.json)" https://localhost:15888/wallet/add | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/add_ton_key.json)" https://localhost:15888/wallet/add | jq

## read public keys
curl -s -X GET -k --key $GATEWAY_KEY --cert $GATEWAY_CERT https://localhost:15888/wallet | jq

## sign message
curl -s -X GET -k --key $GATEWAY_KEY --cert $GATEWAY_CERT "https://localhost:15888/wallet/sign?chain=ethereum&network=mainnet&address=$ETH_ADDRESS&message=messageToBeSigned" | jq

## remove keys
curl -s -X DELETE -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/remove_algorand_key.json)" https://localhost:15888/wallet/remove | jq

curl -s -X DELETE -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/remove_ethereum_key.json)" https://localhost:15888/wallet/remove | jq

curl -s -X DELETE -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/remove_avalanche_key.json)" https://localhost:15888/wallet/remove | jq

curl -s -X DELETE -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/remove_cronos_key.json)" https://localhost:15888/wallet/remove | jq

curl -s -X DELETE -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/remove_bsc_key.json)" https://localhost:15888/wallet/remove | jq

curl -s -X DELETE -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/remove_polygon_key.json)" https://localhost:15888/wallet/remove | jq

curl -s -X DELETE -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/remove_xdc_key.json)" https://localhost:15888/wallet/remove | jq

curl -s -X DELETE -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/remove_osmosis_key.json)" https://localhost:15888/wallet/remove | jq

curl -s -X DELETE -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/remove_ton_key.json)" https://localhost:15888/wallet/remove | jq

# AMM

## price

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/price_uniswap.json)" https://localhost:15888/amm/price | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/price_traderjoe.json)" https://localhost:15888/amm/price | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/price_mad_meerkat.json)" https://localhost:15888/amm/price | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/price_vvs.json)" https://localhost:15888/amm/price | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/price_ref.json)" https://localhost:15888/amm/price | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/price_bsc_pancakeswap.json)" https://localhost:15888/amm/price | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/price_bsc_sushiswap.json)" https://localhost:15888/amm/price | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/price_polygon_sushiswap_buy.json)" https://localhost:15888/amm/price | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/price_polygon_sushiswap_sell.json)" https://localhost:15888/amm/price | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/price_xdc_xsswap.json)" https://localhost:15888/amm/price | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/price_tinyman.json)" https://localhost:15888/amm/price | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/price_osmosis.json)" https://localhost:15888/amm/price | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/price_stonfi.json)" https://localhost:15888/amm/price | jq

## trade

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/eth_uniswap_trade.json)" https://localhost:15888/amm/trade | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/avalanche_traderjoe_trade.json)" https://localhost:15888/amm/trade | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/harmony_testnet_defira_trade.json)" https://localhost:15888/amm/trade | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/cronos_mmf_trade.json)" https://localhost:15888/amm/trade | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/cronos_vvs_trade.json)" https://localhost:15888/amm/trade | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/bsc_pancakeswap_trade.json)" https://localhost:15888/amm/trade | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/bsc_sushiswap_trade.json)" https://localhost:15888/amm/trade | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/polygon_sushiswap_trade_buy.json)" https://localhost:15888/amm/trade | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/polygon_sushiswap_trade_sell.json)" https://localhost:15888/amm/trade | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/algorand_tinyman_trade.json)" https://localhost:15888/amm/trade | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/osmosis_trade.json)" https://localhost:15888/amm/trade | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/ton_stonfi_trade.json)" https://localhost:15888/amm/trade | jq


# EVM

## nonce
curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/eth_nonce.json)" https://localhost:15888/chain/nonce | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/avalanche_nonce.json)" https://localhost:15888/chain/nonce | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/cronos_nonce.json)" https://localhost:15888/chain/nonce | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/bsc_nonce.json)" https://localhost:15888/chain/nonce | jq

## allowances

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/eth_allowances.json)" https://localhost:15888/chain/allowances | jq

## approve

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/eth_approve.json)" https://localhost:15888/chain/approve | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/avalanche_approve.json)" https://localhost:15888/chain/approve | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/cronos_approve.json)" https://localhost:15888/chain/approve | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/bsc_approve.json)" https://localhost:15888/chain/approve | jq

curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/xdc_approve.json)" https://localhost:15888/chain/approve | jq

# Algorand

## post poll
curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/algorand_poll.json)" https://localhost:15888/chain/poll | jq

## get balances
curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/algorand_balances.json)" https://localhost:15888/chain/balances | jq

## get assets
curl -s -X GET -k --key $GATEWAY_KEY --cert $GATEWAY_CERT "https://localhost:15888/chain/tokens?network=mainnet&chain=algorand" | jq

## post opt-in
curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/algorand_opt_in.json)" https://localhost:15888/chain/approve | jq

# XDC and XSSWAP

## check for network status, let's us know that gateway  knows about xdc
curl -s -X GET -k --key $GATEWAY_KEY --cert $GATEWAY_CERT "https://localhost:15888/chain/status?chain=xdc&network=apothem" | jq

## add xdc private key
curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/add_xdc_key.json)" https://localhost:15888/wallet/add | jq

## get all wallets
curl -s -X GET -k --key $GATEWAY_KEY --cert $GATEWAY_CERT https://localhost:15888/wallet | jq

## delete xdc private key
curl -s -X DELETE -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/remove_xdc_key.json)" https://localhost:15888/wallet/remove | jq

## test transaction polling
curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/xdc_poll.json)" https://localhost:15888/chain/poll | jq

## get xdc swap price
curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/price_xdc_xsswap.json)" https://localhost:15888/amm/price | jq

## buy swap
curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/xdc_xsswap_buy.json)" https://localhost:15888/amm/trade | jq

## sell swap
curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/xdc_xsswap_sell.json)" https://localhost:15888/amm/trade | jq

## allowances check
curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/xdc_xsswap_allowances.json)" https://localhost:15888/chain/allowances | jq

## approve
curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/xdc_approve.json)" https://localhost:15888/chain/approve | jq

# Ton

## post poll
curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/ton_poll.json)" https://localhost:15888/chain/poll | jq

## get balances
curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/ton_balances.json)" https://localhost:15888/chain/balances | jq

## get assets
curl -s -X GET -k --key $GATEWAY_KEY --cert $GATEWAY_CERT "https://localhost:15888/chain/tokens?network=mainnet&chain=ton" | jq

## post opt-in
curl -s -X POST -k --key $GATEWAY_KEY --cert $GATEWAY_CERT -H "Content-Type: application/json" -d "$(envsubst < ./requests/ton_opt_in.json)" https://localhost:15888/chain/approve | jq
