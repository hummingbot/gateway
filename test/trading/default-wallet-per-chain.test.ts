// Spied, not stubbed: the real implementation stays the default so the chain schemas that
// read these at import time still load, and each test overrides only the wallet.
jest.mock('../../src/chains/ethereum/ethereum.config', () => {
  const actual = jest.requireActual('../../src/chains/ethereum/ethereum.config');
  return { ...actual, getEthereumChainConfig: jest.fn(actual.getEthereumChainConfig) };
});
jest.mock('../../src/chains/solana/solana.config', () => {
  const actual = jest.requireActual('../../src/chains/solana/solana.config');
  return { ...actual, getSolanaChainConfig: jest.fn(actual.getSolanaChainConfig) };
});

import { getEthereumChainConfig } from '../../src/chains/ethereum/ethereum.config';
import { getSolanaChainConfig } from '../../src/chains/solana/solana.config';
import { resolveWalletAddress } from '../../src/trading/common';
import { UnifiedAmmAddLiquidityRequest } from '../../src/trading/trading-amm-routes/add';

// The trading routes used to share one default wallet: a module-level constant read from
// the Solana config, reaching Ethereum only if that config threw, baked into every route's
// schema as `default:`. Two things followed, and this suite pins both.
//
// Fastify injects schema defaults before the handler runs, so a BSC swap that omitted
// walletAddress arrived carrying a Solana address and failed in address validation naming
// a wallet with nothing to do with the trade (gateway#701). And the constant was read once
// at import, so /wallet/setDefault did not take effect until Gateway restarted.

const ETH_WALLET = '0x628010E5B0c4dC04CAF498312486841630f8b567';
const SOL_WALLET = 'AbCpsXy2HAC5yWe3YwfysYk4x4FSd13WduKkCooREZK2';

const configure = (ethereum: string | undefined, solana: string | undefined) => {
  (getEthereumChainConfig as jest.Mock).mockReturnValue({ defaultWallet: ethereum });
  (getSolanaChainConfig as jest.Mock).mockReturnValue({ defaultWallet: solana });
};

describe('per-chain default wallet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configure(ETH_WALLET, SOL_WALLET);
  });

  it('gives an EVM request the Ethereum wallet, not the Solana one', () => {
    expect(resolveWalletAddress('ethereum', undefined)).toBe(ETH_WALLET);
  });

  it('gives a Solana request the Solana wallet', () => {
    expect(resolveWalletAddress('solana', undefined)).toBe(SOL_WALLET);
  });

  it('prefers the address the caller named on either chain', () => {
    const named = '0x08940dc9B5a19FAb9319b77C61DDA7B8067E6843';
    expect(resolveWalletAddress('ethereum', named)).toBe(named);
    expect(resolveWalletAddress('solana', named)).toBe(named);
  });

  it('rejects rather than passing an unset default down to a connector', () => {
    configure('', SOL_WALLET);
    expect(() => resolveWalletAddress('ethereum', undefined)).toThrow(/no default wallet configured for ethereum/i);
    // The other chain is unaffected by the one that is unset.
    expect(resolveWalletAddress('solana', undefined)).toBe(SOL_WALLET);
  });

  it('reads the config per call, so setDefault does not need a restart', () => {
    expect(resolveWalletAddress('solana', undefined)).toBe(SOL_WALLET);

    const rotated = 'DQcmxgGCEwThGCzV6NmFG2WsbUpch3HLoZAhctcgeRM9';
    configure(ETH_WALLET, rotated);

    expect(resolveWalletAddress('solana', undefined)).toBe(rotated);
  });

  it('carries no schema default, so the handler can tell an omitted wallet apart', () => {
    const walletAddress = (UnifiedAmmAddLiquidityRequest as any).properties.walletAddress;

    // A `default` here would be injected by Fastify before the handler, which is what made
    // the wrong chain's wallet indistinguishable from one the caller typed.
    expect(walletAddress).not.toHaveProperty('default');
    expect((UnifiedAmmAddLiquidityRequest as any).required ?? []).not.toContain('walletAddress');
  });
});
