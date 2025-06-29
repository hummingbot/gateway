import * as fs from 'fs/promises';
import * as path from 'path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { GatewayApiClient } from '../utils/api-client';

async function scanDirectory(dir: string, baseUri: string, resources: any[]): Promise<void> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative('./conf', fullPath);
      
      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        await scanDirectory(fullPath, baseUri, resources);
      } else if (entry.isFile() && !entry.name.startsWith('.')) {
        // Add files (skip hidden files like .DS_Store)
        const ext = path.extname(entry.name);
        if (ext === '.yml' || ext === '.yaml' || ext === '.json') {
          const uri = `${baseUri}/${relativePath}`.replace(/\.(yml|yaml|json)$/, '');
          const mimeType = ext === '.json' ? 'application/json' : 'text/yaml';
          
          // Create a user-friendly name
          let name = relativePath;
          if (relativePath.includes('wallets/')) {
            name = `Wallet: ${entry.name.replace(ext, '')}`;
          } else if (relativePath.includes('tokens/')) {
            const parts = relativePath.split('/');
            name = `Token List: ${parts[parts.length - 1].replace(ext, '')} (${parts[parts.length - 2]})`;
          } else if (relativePath.includes('connectors/')) {
            name = `Connector: ${entry.name.replace(ext, '')}`;
          } else {
            name = entry.name.replace(ext, '');
            name = name.charAt(0).toUpperCase() + name.slice(1) + ' Configuration';
          }
          
          resources.push({
            uri,
            name,
            description: `Configuration file: ${relativePath}`,
            mimeType,
          });
        }
      }
    }
  } catch (error) {
    // Directory might not exist
  }
}

export function registerResources(server: Server, apiClient: GatewayApiClient) {
  // Handle resource list requests
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const resources = [];
    
    // Scan the entire conf directory recursively
    await scanDirectory('./conf', 'gateway://conf', resources);
    
    // Add special wallet list resource (from API)
    resources.push({
      uri: 'gateway://wallet-list',
      name: 'Active Wallets (from API)',
      description: 'List of currently loaded wallets from Gateway API',
      mimeType: 'application/json',
    });
    
    // Add logs resource
    resources.push({
      uri: 'gateway://logs',
      name: 'Gateway Logs',
      description: 'Gateway server logs',
      mimeType: 'text/plain',
    });
    
    // Sort resources by URI for better organization
    resources.sort((a, b) => a.uri.localeCompare(b.uri));
    
    return { resources };
  });

  // Handle resource read requests
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    
    try {
      // Config file resources
      if (uri.startsWith('gateway://conf/')) {
        const configPath = uri.replace('gateway://conf/', '');
        
        // Try different extensions
        const extensions = ['.yml', '.yaml', '.json'];
        let content = null;
        let mimeType = 'text/yaml';
        
        for (const ext of extensions) {
          try {
            const fullPath = path.join('./conf', `${configPath}${ext}`);
            content = await fs.readFile(fullPath, 'utf-8');
            mimeType = ext === '.json' ? 'application/json' : 'text/yaml';
            break;
          } catch {
            // Try next extension
          }
        }
        
        if (!content) {
          throw new Error(`Configuration file not found: ${configPath}`);
        }
        
        return {
          contents: [{
            uri,
            mimeType,
            text: content
          }]
        };
      }
      
      // Logs resource
      if (uri === 'gateway://logs') {
        try {
          // Try to read the most recent log file
          const logsDir = './logs';
          const files = await fs.readdir(logsDir);
          const logFiles = files.filter(f => f.endsWith('.log')).sort().reverse();
          
          if (logFiles.length > 0) {
            const latestLog = path.join(logsDir, logFiles[0]);
            const content = await fs.readFile(latestLog, 'utf-8');
            // Get last 1000 lines
            const lines = content.split('\n');
            const recentLines = lines.slice(-1000).join('\n');
            
            return {
              contents: [{
                uri,
                mimeType: 'text/plain',
                text: `Log file: ${logFiles[0]}\n\nLast 1000 lines:\n${recentLines}`
              }]
            };
          } else {
            return {
              contents: [{
                uri,
                mimeType: 'text/plain',
                text: 'No log files found in ./logs directory'
              }]
            };
          }
        } catch (error) {
          return {
            contents: [{
              uri,
              mimeType: 'text/plain',
              text: `Failed to read logs: ${error instanceof Error ? error.message : String(error)}`
            }]
          };
        }
      }
      
      // Special wallet list from API
      if (uri === 'gateway://wallet-list') {
        const data = await apiClient.get('/wallet/')
          .then((response: any) => {
            // Transform to a more readable format
            const wallets: any[] = [];
            for (const item of response) {
              for (const address of item.walletAddresses) {
                wallets.push({
                  address,
                  chain: item.chain,
                  name: `${item.chain}-wallet`,
                });
              }
            }
            return { wallets, count: wallets.length };
          })
          .catch(() => {
            // If API fails, return empty list
            return { wallets: [], count: 0 };
          });
        
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(data, null, 2)
          }]
        };
      }
      
      
      // Unknown resource
      return {
        contents: [{
          uri,
          mimeType: 'text/plain',
          text: `Unknown resource: ${uri}`
        }]
      };
      
    } catch (error) {
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({
            error: 'Failed to read resource',
            message: error instanceof Error ? error.message : String(error)
          }, null, 2)
        }]
      };
    }
  });
}