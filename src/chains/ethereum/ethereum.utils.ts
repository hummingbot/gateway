// Utility functions for Ethereum chain

// Validates if the input string is a valid Ethereum address
export const isAddress = (address: string): boolean => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};