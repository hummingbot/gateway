#!/usr/bin/env node
import { Command, flags } from '@oclif/command';
import { Solana } from '../chains/solana/solana';
import { Ethereum } from '../chains/ethereum/ethereum';
import { ethers } from 'ethers';
import { logger } from '../services/logger';

/**
 * The Balance command retrieves balance information for a given wallet on a specified chain.
 *
 * Depending on the chain flag, it will:
 *  - Call Solana.getBalance() for the "solana" chain.
 *  - Query the provider (via ethers) for the "ethereum" chain.
 */
export default class Balance extends Command {
  static description = 'Retrieve token balances for a wallet on the specified chain';

  static flags = {
    // Specify the chain ("solana" or "ethereum")
    chain: flags.string({
      char: 'c',
      description: 'Blockchain to check balance from (solana | ethereum)',
      required: true,
    }),
    // The wallet address or identifier
    wallet: flags.string({
      char: 'w',
      description: 'Wallet address or identifier',
      required: false,
    }),
    // Optional network
    network: flags.string({
      char: 'n',
      description: 'Network identifier (default: mainnet)',
      default: 'mainnet',
    }),
    // Optional token filter (for Solana as an example)
    symbol: flags.string({
      char: 's',
      description: 'Token symbol filter (e.g. SOL for Solana)',
      required: false,
    }),
  };

  async run() {
    const { flags } = this.parse(Balance);
    const { chain, wallet, network, symbol } = flags;
    
    if (chain.toLowerCase() === 'solana') {
      // Get a Solana instance for the given network (e.g. mainnet-beta)
      const solana = await Solana.getInstance(network === 'mainnet' ? 'mainnet-beta' : network);
      
      // Determine wallet:
      // If a wallet identifier (the filename) is provided, use it;
      // otherwise, try to use the first available wallet.
      let keypair;
      let walletIdentifier = wallet;
      if (!walletIdentifier) {
        walletIdentifier = await solana.getFirstWalletAddress();
        if (!walletIdentifier) {
          this.error('No wallet provided and none found on file.');
        }
      }
      
      // Load the wallet (returns a Keypair)
      try {
        keypair = await solana.getWallet(walletIdentifier);
      } catch (error: any) {
        this.error(`Unable to load wallet: ${error.message}`);
      }

      // Call the getBalance function on the Solana instance.
      // The "symbol" flag can be used to filter tokens if needed.
      try {
        const balances = await solana.getBalance(keypair, symbol ? [symbol] : undefined);
        logger.info(`Solana wallet balance for ${walletIdentifier}:`);
        logger.info(JSON.stringify(balances, null, 2));
      } catch (error: any) {
        this.error(`Error getting Solana balance: ${error.message}`);
      }
      
    } else if (chain.toLowerCase() === 'ethereum') {
      // Get an Ethereum instance for the given network.
      const ethereum = Ethereum.getInstance(network);
      
      if (!wallet) {
        this.error('For Ethereum, please supply a wallet address.');
      }
      
      try {
        // Get the provider from the Ethereum instance.
        // (Ethereum.provider is assumed to be an ethers Provider)
        const provider = ethereum.provider;
        // Retrieve the balance in Wei via ethers
        const balanceWei = await provider.getBalance(wallet);
        // Format balance from Wei to Ether
        const balanceEth = ethers.utils.formatEther(balanceWei);
        logger.info(`Ethereum wallet balance for ${wallet}: ${balanceEth} ETH`);
      } catch (error: any) {
        this.error(`Error getting Ethereum balance: ${error.message}`);
      }
    } else {
      this.error(`Unsupported chain: ${chain}`);
    }
  }
}