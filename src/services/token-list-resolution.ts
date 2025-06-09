import { promises as fs } from 'fs';

import axios from 'axios';

import { logger } from './logger';

export class TokenListResolutionStrategy {
  resolve: () => Promise<any>;

  constructor(url: string, type: string) {
    this.resolve = async () => {
      try {
        if (type === 'FILE') {
          const fileContent = await fs.readFile(url, 'utf8');
          logger.info(
            `Read token file from ${url}, content length: ${fileContent.length}`,
          );
          const tokens = JSON.parse(fileContent);
          logger.info(`Parsed token count: ${tokens.length}`);
          return tokens;
        } else {
          const response = await axios.get(url);
          logger.info(
            `Fetched token list from ${url}, status: ${response.status}`,
          );
          logger.info(`Token count: ${response.data.tokens?.length || 0}`);
          return response.data.tokens || [];
        }
      } catch (error) {
        logger.error(`Failed to load token list: ${error.message}`);
        logger.error(`URL: ${url}, Type: ${type}`);
        throw error;
      }
    };
  }
}
