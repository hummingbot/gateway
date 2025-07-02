import fs from 'fs';
import path from 'path';

import { FastifyInstance } from 'fastify';

export interface ConnectorTestConfig {
  name: string;
  fastify: FastifyInstance;
}

export async function getConnectorConfig(
  fastify: FastifyInstance,
  connectorName: string,
) {
  const response = await fastify.inject({
    method: 'GET',
    url: '/connectors',
  });

  const { connectors } = JSON.parse(response.body);
  return connectors.find((c: any) => c.name === connectorName);
}

export function validateConnectorFolderStructure(
  connectorName: string,
  tradingTypes: string[],
) {
  const connectorPath = path.join(
    __dirname,
    `../../src/connectors/${connectorName}`,
  );

  // Check for appropriate folders based on trading types
  if (tradingTypes.includes('swap')) {
    const swapRoutesPath = path.join(connectorPath, 'swap-routes');
    expect(fs.existsSync(swapRoutesPath)).toBe(true);

    const files = fs.readdirSync(swapRoutesPath);
    expect(files.some((f) => f.includes('Swap') || f.includes('swap'))).toBe(
      true,
    );
  }

  if (tradingTypes.includes('amm')) {
    const ammRoutesPath = path.join(connectorPath, 'amm-routes');
    expect(fs.existsSync(ammRoutesPath)).toBe(true);
  }

  if (tradingTypes.includes('clmm')) {
    const clmmRoutesPath = path.join(connectorPath, 'clmm-routes');
    expect(fs.existsSync(clmmRoutesPath)).toBe(true);
  }

  // Ensure old 'routes' folder doesn't exist
  const oldRoutesPath = path.join(connectorPath, 'routes');
  expect(fs.existsSync(oldRoutesPath)).toBe(false);
}

export async function testConnectorRoutes(
  config: ConnectorTestConfig,
  tradingTypes: string[],
  connectorInfo?: any,
) {
  const { name, fastify } = config;

  // Get proper chain and network values
  const chain = connectorInfo?.chain || 'ethereum';
  const network = connectorInfo?.networks?.[0] || 'mainnet';

  // Test swap routes
  if (tradingTypes.includes('swap')) {
    const response = await fastify.inject({
      method: 'POST',
      url: `/connectors/${name}/swap/quote`,
      payload: {
        chain,
        network,
        baseToken: chain === 'solana' ? 'SOL' : 'ETH',
        quoteToken: 'USDC',
        amount: 1,
        side: 'SELL',
      },
    });
    // Should exist (may return 400 for validation but not 404)
    expect(response.statusCode).not.toBe(404);
  } else {
    const response = await fastify.inject({
      method: 'POST',
      url: `/connectors/${name}/swap/quote`,
      payload: {},
    });
    expect(response.statusCode).toBe(404);
  }

  // Test AMM routes
  if (tradingTypes.includes('amm')) {
    const response = await fastify.inject({
      method: 'POST',
      url: `/connectors/${name}/amm/quote`,
      payload: {},
    });
    expect(response.statusCode).not.toBe(404);
  } else {
    const response = await fastify.inject({
      method: 'POST',
      url: `/connectors/${name}/amm/quote`,
      payload: {},
    });
    expect(response.statusCode).toBe(404);
  }

  // Test CLMM routes
  if (tradingTypes.includes('clmm')) {
    const response = await fastify.inject({
      method: 'POST',
      url: `/connectors/${name}/clmm/quote`,
      payload: {},
    });
    expect(response.statusCode).not.toBe(404);
  } else {
    const response = await fastify.inject({
      method: 'POST',
      url: `/connectors/${name}/clmm/quote`,
      payload: {},
    });
    expect(response.statusCode).toBe(404);
  }
}
