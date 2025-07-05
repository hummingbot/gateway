import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';

// Resource configuration type
export interface ResourceConfig {
  name: string;
  uri: string;
  mimeType: string;
  description: string;
  handler: ResourceHandler;
}

// Resource handler type
type ResourceHandler = (
  uri: string,
  context: ResourceContext,
) => Promise<string>;

// Context for resource handlers
interface ResourceContext {
  configPath: string;
  logsPath?: string;
}

// Default handler for JSON files
const jsonResourceHandler: ResourceHandler = async (uri, _context) => {
  try {
    // Extract filename from URI
    const match = uri.match(/gateway:\/\/(.+)/);
    if (!match) {
      throw new Error('Invalid resource URI');
    }

    const resourcePath = join(__dirname, 'resources', match[1]);
    const content = readFileSync(resourcePath, 'utf-8');

    return content;
  } catch (error: any) {
    return JSON.stringify(
      {
        error: `Failed to read resource: ${error.message}`,
      },
      null,
      2,
    );
  }
};

// Handler for configuration files
const configResourceHandler: ResourceHandler = async (uri, context) => {
  try {
    // Extract config file from URI
    const match = uri.match(/gateway:\/\/config\/(.+)/);
    if (!match) {
      throw new Error('Invalid config URI');
    }

    const configFile = match[1];
    const configPath = join(context.configPath, configFile);

    if (!existsSync(configPath)) {
      return `Configuration file not found: ${configFile}`;
    }

    const content = readFileSync(configPath, 'utf-8');
    return content;
  } catch (error: any) {
    return `Error reading configuration: ${error.message}`;
  }
};

// Handler for wallet list
const walletListHandler: ResourceHandler = async (_uri, context) => {
  try {
    const walletsPath = join(context.configPath, 'wallets');

    if (!existsSync(walletsPath)) {
      return JSON.stringify(
        {
          wallets: [],
          message: 'No wallets directory found',
        },
        null,
        2,
      );
    }

    const walletFiles = readdirSync(walletsPath)
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.replace('.json', ''));

    return JSON.stringify(
      {
        wallets: walletFiles,
        count: walletFiles.length,
      },
      null,
      2,
    );
  } catch (error: any) {
    return JSON.stringify(
      {
        error: `Failed to list wallets: ${error.message}`,
      },
      null,
      2,
    );
  }
};

// Handler for logs
const logsHandler: ResourceHandler = async (_uri, context) => {
  try {
    if (!context.logsPath || !existsSync(context.logsPath)) {
      return 'No logs available';
    }

    const logFiles = readdirSync(context.logsPath)
      .filter((file) => file.endsWith('.log'))
      .sort()
      .reverse()
      .slice(0, 5); // Last 5 log files

    if (logFiles.length === 0) {
      return 'No log files found';
    }

    // Read the most recent log file
    const latestLog = logFiles[0];
    const logContent = readFileSync(join(context.logsPath, latestLog), 'utf-8');

    // Get last 100 lines
    const lines = logContent.split('\n');
    const recentLines = lines.slice(-100).join('\n');

    return [
      `# Gateway Logs (${latestLog})`,
      '',
      '```',
      recentLines,
      '```',
      '',
      `Available log files: ${logFiles.join(', ')}`,
    ].join('\n');
  } catch (error: any) {
    return `Error reading logs: ${error.message}`;
  }
};

// Static resource definitions
export const RESOURCES: ResourceConfig[] = [
  {
    name: 'gateway-api-endpoints',
    uri: 'gateway://gateway-api-endpoints.json',
    mimeType: 'application/json',
    description:
      'Complete list of Gateway API endpoints for chains and connectors',
    handler: jsonResourceHandler,
  },
  {
    name: 'coingecko-api-endpoints',
    uri: 'gateway://coingecko-api-endpoints.json',
    mimeType: 'application/json',
    description: 'CoinGecko API endpoints available through Gateway MCP',
    handler: jsonResourceHandler,
  },
  {
    name: 'wallet-list',
    uri: 'gateway://wallet-list',
    mimeType: 'application/json',
    description: 'List of configured wallets in Gateway',
    handler: walletListHandler,
  },
  {
    name: 'gateway-logs',
    uri: 'gateway://logs',
    mimeType: 'text/plain',
    description: 'Recent Gateway server logs',
    handler: logsHandler,
  },
];

// Dynamic resource list handler - discovers config files
export async function listDynamicResources(
  context: ResourceContext,
): Promise<ResourceConfig[]> {
  const dynamicResources: ResourceConfig[] = [];

  try {
    // List all config files
    if (existsSync(context.configPath)) {
      const configFiles = readdirSync(context.configPath).filter(
        (file) => file.endsWith('.yml') || file.endsWith('.json'),
      );

      for (const file of configFiles) {
        const name = `config-${basename(file, file.endsWith('.yml') ? '.yml' : '.json')}`;

        dynamicResources.push({
          name,
          uri: `gateway://config/${file}`,
          mimeType: file.endsWith('.json') ? 'application/json' : 'text/yaml',
          description: `Gateway configuration file: ${file}`,
          handler: configResourceHandler,
        });
      }
    }
  } catch (error) {
    // Silently ignore errors in listing dynamic resources
  }

  return dynamicResources;
}

// Combined resource list
export async function getAllResources(
  context: ResourceContext,
): Promise<ResourceConfig[]> {
  const dynamicResources = await listDynamicResources(context);
  return [...RESOURCES, ...dynamicResources];
}

// Resource handler executor
export async function handleResource(
  uri: string,
  context: ResourceContext,
): Promise<string> {
  const allResources = await getAllResources(context);
  const resource = allResources.find((r) => r.uri === uri);

  if (!resource) {
    throw new Error(`Resource not found: ${uri}`);
  }

  return resource.handler(uri, context);
}
