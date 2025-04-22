// Para transferências
const transferTx = api.tx.balances.transfer(destino, valor);

// Para staking
const stakeTx = api.tx.staking.bond(valor, 'Staked');

// Para votação
const voteTx = api.tx.democracy.vote(referendumId, 'Aye');

/**
   * Estimate gas for a transaction
   * @param gasLimit Optional gas limit for the transaction
   * @param address Optional address to use for fee estimation
   * @returns A Promise that resolves to the gas estimation
   */
async estimateTransactionGas(gasLimit?: number): Promise<any> {
  try {
    const api = await this.getApiPromise();
    
    // Get the current block header to get the block hash
    const header = await api.rpc.chain.getHeader();
    
    // Get the runtime version to ensure we have the correct metadata
    const runtimeVersion = await api.rpc.state.getRuntimeVersion();
    
    // Create a sample transfer transaction to estimate base fees
    const transferTx = api.tx.system.remark('0x00');
    
    const feeAddress = address;
    
    // Get the payment info for the transaction
    const paymentInfo = await transferTx.paymentInfo(feeAddress);
    
    // Convert the fee to human readable format (HDX)
    const fee = new BigNumber(paymentInfo.partialFee.toString());
    
    // Calculate gas price based on fee and gas limit
    const calculatedGasLimit = gasLimit || 1000000;
    const gasPrice = fee / calculatedGasLimit;
    
    return {
      gasPrice: gasPrice.toFixed(12), // Show full decimal value with 12 places
      gasPriceToken: this.config.network.nativeCurrencySymbol,
      gasLimit: calculatedGasLimit.toString(),
      gasCost: fee
    };
  } catch (error) {
    logger.error(`Failed to estimate gas: ${error.message}`);
    // Fallback to default values if estimation fails
    return {
      gasPrice: 0,
      gasPriceToken: this.config.network.nativeCurrencySymbol,
      gasLimit: gasLimit || 1000000,
      gasCost: 0
    };
  }
}