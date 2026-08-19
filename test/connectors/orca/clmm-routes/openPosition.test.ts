import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { Keypair, Transaction } from '@solana/web3.js';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/orca/orca');
jest.mock('../../../../src/connectors/orca/orca.utils', () => ({
  extractInnerTransferAmounts: jest.fn(),
}));
jest.mock('@orca-so/whirlpools', () => ({
  openPositionInstructionsWithTickBounds: jest.fn(),
}));
jest.mock('@orca-so/whirlpools-client', () => ({
  fetchAllMaybeTickArray: jest.fn(),
  fetchWhirlpool: jest.fn(),
  getInitializeDynamicTickArrayInstruction: jest.fn(),
  getOpenPositionWithTokenExtensionsInstruction: jest.fn(),
  getPositionAddress: jest.fn(),
  getTickArrayAddress: jest.fn(),
}));
jest.mock('@orca-so/whirlpools-core', () => ({
  getInitializableTickIndex: jest.fn((tick: number) => tick),
  getTickArrayStartTickIndex: jest.fn((tick: number) => tick),
  increaseLiquidityQuoteA: jest.fn(),
  increaseLiquidityQuoteB: jest.fn(),
  priceToTickIndex: jest.fn((price: number) => Math.round(price)),
}));
jest.mock('@solana-program/token-2022', () => ({
  fetchAllMint: jest.fn(),
}));

import { openPositionInstructionsWithTickBounds } from '@orca-so/whirlpools';
import {
  fetchAllMaybeTickArray,
  fetchWhirlpool,
  getOpenPositionWithTokenExtensionsInstruction,
  getPositionAddress,
  getTickArrayAddress,
} from '@orca-so/whirlpools-client';
import { increaseLiquidityQuoteA } from '@orca-so/whirlpools-core';
import { fetchAllMint } from '@solana-program/token-2022';

import { Solana } from '../../../../src/chains/solana/solana';
import { openPosition } from '../../../../src/connectors/orca/clmm-routes/openPosition';
import { Orca } from '../../../../src/connectors/orca/orca';

const WALLET = 'BPgNwGDBiRuaAKuRQLpXC9rCiw5FfJDDdTunDEmtN6VF';
const POOL = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
const TOKEN_A = 'So11111111111111111111111111111111111111112';
const TOKEN_B = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const PROGRAM = 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc';

describe('openPosition', () => {
  let sendForWallet: jest.Mock;
  let positionAddresses: Map<string, string>;

  beforeEach(() => {
    jest.clearAllMocks();
    positionAddresses = new Map();
    sendForWallet = jest.fn().mockResolvedValue({ signature: 'open-signature', fee: 0.00001 });
    (Solana.getInstance as jest.Mock).mockResolvedValue({
      sendAndConfirmTransactionForWallet: sendForWallet,
      connection: { getTransaction: jest.fn().mockResolvedValue(null) },
      getConfirmedTransactionData: jest.fn().mockResolvedValue(null),
    });
    (Orca.getInstance as jest.Mock).mockResolvedValue({
      solanaKitRpc: { getEpochInfo: jest.fn(() => ({ send: jest.fn().mockResolvedValue({ epoch: 1n }) })) },
      deployment: { programId: PROGRAM, configAddress: POOL },
    });
    (fetchWhirlpool as jest.Mock).mockResolvedValue({
      address: POOL,
      data: { tokenMintA: TOKEN_A, tokenMintB: TOKEN_B, tickSpacing: 1, sqrtPrice: 10n },
    });
    (fetchAllMint as jest.Mock).mockResolvedValue([
      { data: { decimals: 9, extensions: { __option: 'None' } } },
      { data: { decimals: 6, extensions: { __option: 'None' } } },
    ]);
    (getPositionAddress as jest.Mock).mockImplementation(async (mint: string) => {
      if (!positionAddresses.has(mint)) {
        positionAddresses.set(mint, Keypair.generate().publicKey.toBase58());
      }
      return [positionAddresses.get(mint), 255];
    });
    (getTickArrayAddress as jest.Mock)
      .mockResolvedValueOnce([Keypair.generate().publicKey.toBase58(), 1])
      .mockResolvedValueOnce([Keypair.generate().publicKey.toBase58(), 2]);
    (fetchAllMaybeTickArray as jest.Mock).mockResolvedValue([{ exists: true }, { exists: true }]);
  });

  it('substitutes Gateway’s Web3 position signer into Orca v8 open instructions', async () => {
    const generatedMint = Keypair.generate().publicKey.toBase58();
    const generatedPosition = Keypair.generate().publicKey.toBase58();
    positionAddresses.set(generatedMint, generatedPosition);
    const generatedTokenAccount = getAssociatedTokenAddressSync(
      new (require('@solana/web3.js').PublicKey)(generatedMint),
      new (require('@solana/web3.js').PublicKey)(WALLET),
      false,
      TOKEN_2022_PROGRAM_ID,
    ).toBase58();
    (increaseLiquidityQuoteA as jest.Mock).mockReturnValue({
      liquidityDelta: 50n,
      tokenEstA: 900_000_000n,
      tokenEstB: 40_000_000n,
      tokenMaxA: 1_000_000_000n,
      tokenMaxB: 45_000_000n,
    });
    (openPositionInstructionsWithTickBounds as jest.Mock).mockResolvedValue({
      positionMint: generatedMint,
      instructions: [
        {
          programAddress: PROGRAM,
          accounts: [
            { address: generatedMint, role: 3 },
            { address: generatedPosition, role: 1 },
            { address: generatedTokenAccount, role: 1 },
          ],
          data: new Uint8Array([1]),
        },
      ],
    });

    const result = await openPosition('mainnet-beta', WALLET, POOL, 1, 2, 1, undefined, 1);
    expect(result.data.positionAddress).not.toBe(generatedPosition);
    expect(sendForWallet).toHaveBeenCalledWith(expect.any(Transaction), WALLET, [expect.any(Keypair)]);
    const [transaction, , extraSigners] = sendForWallet.mock.calls[0] as [Transaction, string, Keypair[]];
    const gatewayMint = extraSigners[0].publicKey.toBase58();
    expect(transaction.instructions[0].keys.some((key) => key.pubkey.toBase58() === gatewayMint && key.isSigner)).toBe(
      true,
    );
    expect(transaction.instructions[0].keys.some((key) => key.pubkey.toBase58() === generatedMint)).toBe(false);
    expect(openPositionInstructionsWithTickBounds).toHaveBeenCalledWith(
      expect.any(Object),
      POOL,
      { tokenMaxA: 1_000_000_000n, tokenMaxB: 45_000_000n },
      1,
      2,
      expect.objectContaining({ funder: expect.objectContaining({ address: WALLET }) }),
    );
  });

  it('uses the latest low-level open instruction for an empty position', async () => {
    (getOpenPositionWithTokenExtensionsInstruction as jest.Mock).mockImplementation((input) => ({
      programAddress: PROGRAM,
      accounts: [{ address: input.positionMint.address, role: 3 }],
      data: new Uint8Array([2]),
    }));

    const result = await openPosition('mainnet-beta', WALLET, POOL, 1, 2);
    expect(result.data.baseTokenAmountAdded).toBe(0);
    expect(openPositionInstructionsWithTickBounds).not.toHaveBeenCalled();
    expect(getOpenPositionWithTokenExtensionsInstruction).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: WALLET,
        withTokenMetadataExtension: true,
      }),
      { programAddress: PROGRAM },
    );
    expect(sendForWallet).toHaveBeenCalledWith(expect.any(Transaction), WALLET, [expect.any(Keypair)]);
  });

  it('rejects an inverted range before touching Orca', async () => {
    await expect(openPosition('mainnet-beta', WALLET, POOL, 2, 1)).rejects.toThrow(
      'lowerPrice must be less than upperPrice',
    );
    expect(fetchWhirlpool).not.toHaveBeenCalled();
  });
});
