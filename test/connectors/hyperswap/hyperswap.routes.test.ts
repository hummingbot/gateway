import '../../mocks/app-mocks';

import fs from 'fs';
import path from 'path';

import { FastifyInstance } from 'fastify';

import { gatewayApp } from '../../../src/app';
import {
  getHyperswapV2FactoryAddress,
  getHyperswapV2RouterAddress,
} from '../../../src/connectors/hyperswap/hyperswap.contracts';

describe('Hyperswap Routes Structure', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = gatewayApp;
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  it('advertises HyperEVM AMM support in connector config', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/config/connectors',
    });

    const { connectors } = JSON.parse(response.body);
    const hyperswapConfig = connectors.find((connector: any) => connector.name === 'hyperswap');

    expect(hyperswapConfig).toBeDefined();
    expect(hyperswapConfig.chain).toBe('ethereum');
    expect(hyperswapConfig.networks).toContain('hyperevm');
    expect(hyperswapConfig.trading_types).toEqual(['amm']);
  });

  it('registers only the HyperSwap AMM route surface', () => {
    const routes = fastify.printRoutes();

    expect(routes).toContain('hyperswap/amm/');
    expect(routes).toContain('quote-swap');
    expect(routes).toContain('execute-swap');
    expect(routes).not.toContain('hyperswap/router/');
    expect(routes).not.toContain('hyperswap/clmm/');
  });

  it('keeps the connector folder AMM-only until HyperSwap CLMM/router addresses are configured', () => {
    const hyperswapPath = path.join(__dirname, '../../../src/connectors/hyperswap');

    expect(fs.existsSync(path.join(hyperswapPath, 'amm-routes'))).toBe(true);
    expect(fs.existsSync(path.join(hyperswapPath, 'router-routes'))).toBe(false);
    expect(fs.existsSync(path.join(hyperswapPath, 'clmm-routes'))).toBe(false);
  });

  it('uses documented HyperSwap V2 contracts on HyperEVM mainnet', () => {
    expect(getHyperswapV2FactoryAddress('hyperevm')).toBe('0x4df039804873717bff7d03694fb941cf0469b79e');
    expect(getHyperswapV2RouterAddress('hyperevm')).toBe('0xda0f518d521e0dE83fAdC8500C2D21b6a6C39bF9');
  });
});
