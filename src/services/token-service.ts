import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

import { PublicKey } from '@solana/web3.js';
import { ethers } from 'ethers';
import * as fse from 'fs-extra';

import { rootPath } from '../paths';
import { Token, TokenFileFormat, SupportedChain, isSupportedChain } from '../tokens/types';

import { logger } from './logger';

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const exists = promisify(fs.exists);

export class TokenService {
  private static instance: TokenService;

  private constructor() {}

  public static getInstance(): TokenService {
    if (!TokenService.instance) {
      TokenService.instance = new TokenService();
    }
    return TokenService.instance;
  }

  /**
   * Get the path to a token list file with security validation
   */
  private getTokenListPath(chain: string, network: string): string {
    // Validate chain and network to prevent path traversal
    if (!chain || !network) {
      throw new Error('Chain and network parameters are required');
    }

    // Remove any path traversal attempts
    const sanitizedChain = path.basename(chain);
    const sanitizedNetwork = path.basename(network);

    // Additional validation - only allow alphanumeric, dash, and underscore
    const validPathRegex = /^[a-zA-Z0-9_-]+$/;
    if (!validPathRegex.test(sanitizedChain)) {
      throw new Error(`Invalid chain name: ${chain}`);
    }
    if (!validPathRegex.test(sanitizedNetwork)) {
      throw new Error(`Invalid network name: ${network}`);
    }

    // Construct the path
    const tokenListPath = path.join(rootPath(), 'conf', 'tokens', sanitizedChain, `${sanitizedNetwork}.json`);

    // Ensure the resolved path is within the expected directory
    const expectedRoot = path.join(rootPath(), 'conf', 'tokens');
    const resolvedPath = path.resolve(tokenListPath);
    if (!resolvedPath.startsWith(path.resolve(expectedRoot))) {
      throw new Error('Invalid path: attempted directory traversal');
    }

    return resolvedPath;
  }

  /**
   * Validate that chain and network combination is valid
   */
  private async validateChainNetwork(chain: string, _network: string): Promise<void> {
    if (!isSupportedChain(chain)) {
      throw new Error(`Unsupported chain: ${chain}. Supported chains: ${Object.values(SupportedChain).join(', ')}`);
    }

    // Additional validation is handled by getTokenListPath
    // which includes path traversal protection
  }

  /**
   * Load token list from file
   */
  public async loadTokenList(chain: string, network: string): Promise<Token[]> {
    await this.validateChainNetwork(chain, network);

    const tokenListPath = this.getTokenListPath(chain, network);

    if (!fs.existsSync(tokenListPath)) {
      throw new Error(`Token list not found for ${chain}/${network} at ${tokenListPath}`);
    }

    try {
      const data = await readFile(tokenListPath, 'utf8');
      const tokens: TokenFileFormat = JSON.parse(data);

      if (!Array.isArray(tokens)) {
        throw new Error(`Invalid token list format: expected array`);
      }

      return tokens;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in token list file: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Save token list to file with atomic write
   */
  public async saveTokenList(chain: string, network: string, tokens: Token[]): Promise<void> {
    await this.validateChainNetwork(chain, network);

    const tokenListPath = this.getTokenListPath(chain, network);
    const dirPath = path.dirname(tokenListPath);

    // Ensure directory exists (safe because getTokenListPath validates the path)
    if (!fs.existsSync(dirPath)) {
      await fse.ensureDir(dirPath);
    }

    // Create temp file in the same directory to ensure atomic operation works
    const tempFileName = `.${path.basename(tokenListPath)}.tmp`;
    const tempPath = path.join(dirPath, tempFileName);

    // Validate temp path is still within expected directory
    const expectedRoot = path.join(rootPath(), 'conf', 'tokens');
    if (!path.resolve(tempPath).startsWith(path.resolve(expectedRoot))) {
      throw new Error('Invalid temp file path');
    }

    try {
      // Write to temporary file first
      await writeFile(tempPath, JSON.stringify(tokens, null, 2), 'utf8');

      // Atomic rename
      fs.renameSync(tempPath, tokenListPath);

      logger.info(`Token list saved for ${chain}/${network}: ${tokens.length} tokens`);
    } catch (error) {
      // Clean up temp file if it exists
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      throw new Error(`Failed to save token list: ${error.message}`);
    }
  }

  /**
   * List tokens with optional search
   */
  public async listTokens(chain: string, network: string, search?: string): Promise<Token[]> {
    const allTokens = await this.loadTokenList(chain, network);

    if (search) {
      const searchLower = search.toLowerCase();
      return allTokens.filter(
        (token) =>
          token.symbol.toLowerCase().includes(searchLower) ||
          token.name.toLowerCase().includes(searchLower) ||
          token.address.toLowerCase().includes(searchLower),
      );
    }

    return allTokens;
  }

  /**
   * Get specific token by symbol or address
   */
  public async getToken(chain: string, network: string, symbolOrAddress: string): Promise<Token | null> {
    const tokens = await this.loadTokenList(chain, network);

    // First try exact symbol match (case insensitive)
    const symbolLower = symbolOrAddress.toLowerCase();
    let token = tokens.find((t) => t.symbol.toLowerCase() === symbolLower);

    if (token) {
      return token;
    }

    // Then try address match (case insensitive for Ethereum)
    const addressLower = symbolOrAddress.toLowerCase();
    token = tokens.find((t) => t.address.toLowerCase() === addressLower);

    return token || null;
  }

  /**
   * Validate token data based on chain requirements
   */
  public async validateToken(chain: string, token: Token): Promise<void> {
    // Common validations
    if (!token.symbol || typeof token.symbol !== 'string' || token.symbol.trim() === '') {
      throw new Error('Token symbol is required and must be a non-empty string');
    }

    if (!token.name || typeof token.name !== 'string' || token.name.trim() === '') {
      throw new Error('Token name is required and must be a non-empty string');
    }

    if (!token.address || typeof token.address !== 'string' || token.address.trim() === '') {
      throw new Error('Token address is required and must be a non-empty string');
    }

    if (typeof token.decimals !== 'number' || token.decimals < 0 || token.decimals > 255) {
      throw new Error('Token decimals must be a number between 0 and 255');
    }

    // Chain-specific validations
    switch (chain) {
      case SupportedChain.ETHEREUM:
        try {
          // Validate Ethereum address format and checksum
          const checksumAddress = ethers.utils.getAddress(token.address);
          if (token.address !== checksumAddress) {
            throw new Error(`Invalid Ethereum address checksum. Expected: ${checksumAddress}`);
          }
        } catch (error) {
          throw new Error(`Invalid Ethereum address: ${error.message}`);
        }
        break;

      case SupportedChain.SOLANA:
        try {
          // Validate Solana address format
          new PublicKey(token.address);
        } catch (error) {
          throw new Error(`Invalid Solana address: ${error.message}`);
        }
        break;

      default:
        throw new Error(`Unsupported chain for validation: ${chain}`);
    }
  }

  /**
   * Add new token
   */
  public async addToken(chain: string, network: string, token: Token): Promise<void> {
    await this.validateToken(chain, token);

    const tokens = await this.loadTokenList(chain, network);

    // Check for duplicate address
    const existingToken = tokens.find((t) => t.address.toLowerCase() === token.address.toLowerCase());

    if (existingToken) {
      throw new Error(`Token with address ${token.address} already exists with symbol ${existingToken.symbol}`);
    }

    // Add the new token
    tokens.push(token);

    // Save updated list
    await this.saveTokenList(chain, network, tokens);

    logger.info(`Added token ${token.symbol} (${token.address}) to ${chain}/${network}`);
  }

  /**
   * Remove token by address only
   */
  public async removeToken(chain: string, network: string, address: string): Promise<void> {
    const tokens = await this.loadTokenList(chain, network);

    // Find token to remove by address only
    const indexToRemove = tokens.findIndex((t) => t.address.toLowerCase() === address.toLowerCase());

    if (indexToRemove === -1) {
      throw new Error(`Token with address ${address} not found in ${chain}/${network}`);
    }

    const removedToken = tokens[indexToRemove];
    tokens.splice(indexToRemove, 1);

    // Save updated list
    await this.saveTokenList(chain, network, tokens);

    logger.info(`Removed token ${removedToken.symbol} (${removedToken.address}) from ${chain}/${network}`);
  }
}
