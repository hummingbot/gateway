import { beginCell, Address, Cell, ContractProvider } from '@ton/core';
import { Asset, ReadinessStatus, VaultNative, JettonWallet } from '@dedust/sdk';
import { Pool as DedustPool } from '@dedust/sdk';

// Mock address creation
export const mockAddress = Address.parse('EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG');

// Mock Asset class
export class MockAsset implements Asset {
  type: number = 0;
  equals() { return true; }
  writeTo() { return; }
  toSlice() { return {} as any; }
}

// Mock JettonWallet class
export class MockJettonWallet implements JettonWallet {
  address = mockAddress;
  sendTransfer(): Promise<void> { return Promise.resolve(); }
  sendBurn(): Promise<void> { return Promise.resolve(); }
  // @ts-ignore
  getWalletData(provider: ContractProvider) { 
    return Promise.resolve({
      balance: BigInt(0),
      ownerAddress: mockAddress,
      minterAddress: mockAddress,
      walletCode: new Cell()
    }); 
  }
  getBalance() { return Promise.resolve(BigInt(0)); }
}

// Mock Pool class
export class MockPool implements DedustPool {
  address = mockAddress;
  contract = this;
  getReadinessStatus() { return Promise.resolve(ReadinessStatus.READY); }
  getPoolType() { return Promise.resolve(0); }
  getAssets() { 
    return Promise.resolve([new MockAsset(), new MockAsset()] as [Asset, Asset]); 
  }
  getEstimatedSwapOut() { 
    return Promise.resolve({
      assetOut: new MockAsset(),
      amountOut: BigInt(0),
      tradeFee: BigInt(0)
    });
  }
  getExpectedSpendAmount() { return Promise.resolve(BigInt(0)); }
  getMinSpendAmount() { return Promise.resolve(BigInt(0)); }
  getMaxSpendAmount() { return Promise.resolve(BigInt(0)); }
  getEstimatedFee() { return Promise.resolve(BigInt(0)); }
  getEstimateDepositOut() { 
    return Promise.resolve({
      deposits: [BigInt(0), BigInt(0)] as [bigint, bigint],
      fairSupply: BigInt(0)
    });
  }
  getReserves() { 
    return Promise.resolve([BigInt(0), BigInt(0)] as [bigint, bigint]); 
  }
  getTradeFee() { 
    return Promise.resolve(0.3);
  }
  getWalletAddress() { return Promise.resolve(mockAddress); }
  // @ts-ignore
  getWallet(ownerAddress: Address) { 
    return Promise.resolve(new MockJettonWallet());
  }
}

// Mock Vault class
export class MockVault implements VaultNative {
  address = mockAddress;
  contract = this;
  getReadinessStatus() { return Promise.resolve(ReadinessStatus.READY); }
  sendDepositLiquidity() { return Promise.resolve(); }
  getAsset() { return Promise.resolve(new MockAsset()); }
  // @ts-ignore
  sendSwap(amount: bigint, asset: Asset, recipient: Address, referralAddress?: Address) { 
    return Promise.resolve({ hash: 'mock-tx-hash' }); 
  }
}

// Mock function responses
export const mockEstimateSwap = jest.fn().mockResolvedValue({
  amountOut: BigInt('1000000000'),
  tradeFee: BigInt('1000000'),
  assetOut: {}
});

export const mockSendSwap = jest.fn().mockResolvedValue({
  hash: 'mock-tx-hash'
});

export const mockCreateSwapMessage = jest.fn().mockReturnValue(beginCell().endCell());
export const mockCreateTransferMessage = jest.fn().mockResolvedValue(beginCell().endCell()); 