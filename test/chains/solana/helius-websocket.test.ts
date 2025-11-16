import WebSocket from 'ws';

import { HeliusService } from '../../../src/chains/solana/helius-service';
import { RPCProviderConfig } from '../../../src/services/rpc-provider-base';

// Mock WebSocket
jest.mock('ws');

describe('HeliusService WebSocket Functionality', () => {
  let heliusService: HeliusService;
  let mockConfig: RPCProviderConfig;
  let mockWs: jest.Mocked<WebSocket>;

  beforeEach(() => {
    mockConfig = {
      apiKey: 'test-api-key-123',
      useWebSocket: true,
    };

    // Create mock WebSocket instance with automatic 'open' event triggering
    mockWs = {
      on: jest.fn((event: string, callback: (...args: any[]) => void) => {
        // Store callbacks for later manual triggering
        if (event === 'open') {
          // Automatically trigger 'open' event to resolve connectWebSocket promise
          setImmediate(() => callback());
        }
      }),
      send: jest.fn(),
      close: jest.fn(),
      readyState: WebSocket.OPEN,
    } as any;

    // Mock WebSocket constructor
    (WebSocket as jest.MockedClass<typeof WebSocket>).mockImplementation(() => mockWs);

    heliusService = new HeliusService(mockConfig, {
      chain: 'solana',
      network: 'mainnet-beta',
      chainId: 101,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('WebSocket Connection', () => {
    it('should connect to mainnet WebSocket endpoint with API key', async () => {
      await heliusService.initialize();

      expect(WebSocket).toHaveBeenCalledWith('wss://mainnet.helius-rpc.com/?api-key=test-api-key-123');
      expect(heliusService.isWebSocketConnected()).toBe(true);
    });

    it('should connect to devnet WebSocket endpoint for devnet network', async () => {
      heliusService = new HeliusService(mockConfig, {
        chain: 'solana',
        network: 'devnet',
        chainId: 103,
      });

      await heliusService.initialize();

      expect(WebSocket).toHaveBeenCalledWith('wss://devnet.helius-rpc.com/?api-key=test-api-key-123');
      expect(heliusService.isWebSocketConnected()).toBe(true);
    });

    it('should not initialize WebSocket if useWebSocket is false', async () => {
      const configWithoutWs = {
        apiKey: 'test-api-key-123',
        useWebSocket: false,
      };
      heliusService = new HeliusService(configWithoutWs, {
        chain: 'solana',
        network: 'mainnet-beta',
        chainId: 101,
      });

      await heliusService.initialize();

      expect(WebSocket).not.toHaveBeenCalled();
      expect(heliusService.isWebSocketConnected()).toBe(false);
    });

    it('should not initialize WebSocket if API key is missing', async () => {
      const configWithoutKey = {
        apiKey: '',
        useWebSocket: true,
      };
      heliusService = new HeliusService(configWithoutKey, {
        chain: 'solana',
        network: 'mainnet-beta',
        chainId: 101,
      });

      await heliusService.initialize();

      expect(WebSocket).not.toHaveBeenCalled();
      expect(heliusService.isWebSocketConnected()).toBe(false);
    });
  });

  describe('Transaction Monitoring - Successful Transaction', () => {
    it('should resolve with confirmed=true when transaction succeeds (err=null)', async () => {
      await heliusService.initialize();

      const onMessageCallback = mockWs.on.mock.calls.find((call) => call[0] === 'message')?.[1];

      const signature = '2EBVM6cB8vAAD93Ktr6Vd8p67XPbQzCJX47MpReuiCXJAtcjaxpvWpcg9Ege1Nr5Tk3a2GFrByT7WPBjdsTycY9b';
      const monitorPromise = heliusService.monitorTransaction(signature, 30000);

      // Verify subscription message was sent
      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"method":"signatureSubscribe"'));
      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining(signature));

      // First send subscription confirmation (maps local ID 1 to server ID 20100749)
      const subscriptionConfirmation = {
        jsonrpc: '2.0',
        result: 20100749,
        id: 1,
      };

      if (onMessageCallback) {
        onMessageCallback.call(mockWs, Buffer.from(JSON.stringify(subscriptionConfirmation)));
      }

      // Then simulate successful transaction notification with server subscription ID
      const successNotification = {
        jsonrpc: '2.0',
        method: 'signatureNotification',
        params: {
          result: {
            context: {
              slot: 5207624,
            },
            value: {
              err: null,
            },
          },
          subscription: 20100749,
        },
      };

      if (onMessageCallback) {
        onMessageCallback.call(mockWs, Buffer.from(JSON.stringify(successNotification)));
      }

      const result = await monitorPromise;

      expect(result.confirmed).toBe(true);
      expect(result.txData).toBeDefined();
      expect(result.txData.value.err).toBeNull();
    });
  });

  describe('Transaction Monitoring - Failed Transaction', () => {
    it('should resolve with confirmed=false when transaction fails (err present)', async () => {
      await heliusService.initialize();

      const onMessageCallback = mockWs.on.mock.calls.find((call) => call[0] === 'message')?.[1];

      const signature = 'FailedTransactionSignature123';
      const monitorPromise = heliusService.monitorTransaction(signature, 30000);

      // First send subscription confirmation
      const subscriptionConfirmation = {
        jsonrpc: '2.0',
        result: 20100750,
        id: 1,
      };

      if (onMessageCallback) {
        onMessageCallback.call(mockWs, Buffer.from(JSON.stringify(subscriptionConfirmation)));
      }

      // Then simulate failed transaction notification
      const failedNotification = {
        jsonrpc: '2.0',
        method: 'signatureNotification',
        params: {
          result: {
            context: {
              slot: 5207625,
            },
            value: {
              err: {
                InstructionError: [0, 'InvalidAccountData'],
              },
            },
          },
          subscription: 20100750,
        },
      };

      if (onMessageCallback) {
        onMessageCallback.call(mockWs, Buffer.from(JSON.stringify(failedNotification)));
      }

      const result = await monitorPromise;

      expect(result.confirmed).toBe(false);
      expect(result.txData).toBeDefined();
      expect(result.txData.value.err).toEqual({
        InstructionError: [0, 'InvalidAccountData'],
      });
    });

    it('should handle various transaction error types correctly', async () => {
      await heliusService.initialize();

      const onMessageCallback = mockWs.on.mock.calls.find((call) => call[0] === 'message')?.[1];

      const errorTypes = [
        { InsufficientFundsForFee: {} },
        { InstructionError: [1, 'CustomError'] },
        'AccountInUse',
        { DuplicateSignature: {} },
      ];

      for (let i = 0; i < errorTypes.length; i++) {
        const signature = `ErrorTestSignature${i}`;
        const localId = i + 1;
        const serverSubId = 20100751 + i;
        const monitorPromise = heliusService.monitorTransaction(signature, 30000);

        // Send subscription confirmation first
        const subscriptionConfirmation = {
          jsonrpc: '2.0',
          result: serverSubId,
          id: localId,
        };

        if (onMessageCallback) {
          onMessageCallback.call(mockWs, Buffer.from(JSON.stringify(subscriptionConfirmation)));
        }

        // Then send failed notification
        const failedNotification = {
          jsonrpc: '2.0',
          method: 'signatureNotification',
          params: {
            result: {
              context: { slot: 5207626 + i },
              value: {
                err: errorTypes[i],
              },
            },
            subscription: serverSubId,
          },
        };

        if (onMessageCallback) {
          onMessageCallback.call(mockWs, Buffer.from(JSON.stringify(failedNotification)));
        }

        const result = await monitorPromise;

        expect(result.confirmed).toBe(false);
        expect(result.txData.value.err).toEqual(errorTypes[i]);
      }
    });
  });

  describe('Transaction Monitoring - Timeout', () => {
    it('should resolve with confirmed=false when timeout is reached', async () => {
      await heliusService.initialize();

      const signature = 'TimeoutTestSignature';
      const monitorPromise = heliusService.monitorTransaction(signature, 100); // 100ms timeout

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      const result = await monitorPromise;

      expect(result.confirmed).toBe(false);
      expect(result.txData).toBeUndefined();
    });
  });

  describe('Subscription Management', () => {
    it('should send unsubscribe message after receiving notification', async () => {
      await heliusService.initialize();

      const onMessageCallback = mockWs.on.mock.calls.find((call) => call[0] === 'message')?.[1];

      const signature = 'UnsubscribeTestSignature';
      const monitorPromise = heliusService.monitorTransaction(signature, 30000);

      // First send subscription confirmation
      const subscriptionConfirmation = {
        jsonrpc: '2.0',
        result: 20100755,
        id: 1,
      };

      if (onMessageCallback) {
        onMessageCallback.call(mockWs, Buffer.from(JSON.stringify(subscriptionConfirmation)));
      }

      // Clear previous send calls
      mockWs.send.mockClear();

      // Then simulate successful notification
      const successNotification = {
        jsonrpc: '2.0',
        method: 'signatureNotification',
        params: {
          result: {
            context: { slot: 5207624 },
            value: { err: null },
          },
          subscription: 20100755,
        },
      };

      if (onMessageCallback) {
        onMessageCallback.call(mockWs, Buffer.from(JSON.stringify(successNotification)));
      }

      await monitorPromise;

      // Verify unsubscribe was sent with server subscription ID
      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"method":"signatureUnsubscribe"'));
      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"params":[20100755]'));
    });
  });

  describe('WebSocket Error Handling', () => {
    it('should reject monitor promise when WebSocket subscription returns error', async () => {
      await heliusService.initialize();

      const onMessageCallback = mockWs.on.mock.calls.find((call) => call[0] === 'message')?.[1];

      const signature = 'ErrorSubscriptionSignature';
      const monitorPromise = heliusService.monitorTransaction(signature, 30000);

      // Simulate WebSocket error response
      const errorResponse = {
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: -32602,
          message: 'Invalid params',
        },
      };

      if (onMessageCallback) {
        onMessageCallback.call(mockWs, Buffer.from(JSON.stringify(errorResponse)));
      }

      await expect(monitorPromise).rejects.toThrow('WebSocket error: Invalid params');
    });

    it('should throw error if trying to monitor transaction when WebSocket not connected', async () => {
      // Don't initialize WebSocket
      const signature = 'NoConnectionSignature';

      await expect(heliusService.monitorTransaction(signature, 30000)).rejects.toThrow('WebSocket not connected');
    });
  });

  describe('WebSocket Reconnection', () => {
    it('should reject pending subscriptions on disconnect', async () => {
      await heliusService.initialize();

      const onMessageCallback = mockWs.on.mock.calls.find((call) => call[0] === 'message')?.[1];
      const onCloseCallback = mockWs.on.mock.calls.find((call) => call[0] === 'close')?.[1];

      const signature = 'DisconnectTestSignature';
      const monitorPromise = heliusService.monitorTransaction(signature, 30000);

      // Send subscription confirmation to establish the subscription
      const subscriptionConfirmation = {
        jsonrpc: '2.0',
        result: 20100756,
        id: 1,
      };

      if (onMessageCallback) {
        onMessageCallback.call(mockWs, Buffer.from(JSON.stringify(subscriptionConfirmation)));
      }

      // Simulate disconnect
      if (onCloseCallback) {
        onCloseCallback.call(mockWs, 1006, Buffer.from('Connection lost'));
      }

      await expect(monitorPromise).rejects.toThrow('WebSocket disconnected');
    });
  });

  describe('Message Parsing', () => {
    it('should handle malformed JSON messages gracefully', async () => {
      await heliusService.initialize();

      const onMessageCallback = mockWs.on.mock.calls.find((call) => call[0] === 'message')?.[1];

      // Send malformed JSON
      if (onMessageCallback) {
        onMessageCallback.call(mockWs, Buffer.from('{ invalid json'));
      }

      // Should not crash - error should be logged
      expect(heliusService.isWebSocketConnected()).toBe(true);
    });

    it('should ignore unknown notification types', async () => {
      await heliusService.initialize();

      const onMessageCallback = mockWs.on.mock.calls.find((call) => call[0] === 'message')?.[1];

      const unknownNotification = {
        jsonrpc: '2.0',
        method: 'unknownMethod',
        params: {
          subscription: 999,
          result: {},
        },
      };

      if (onMessageCallback) {
        onMessageCallback.call(mockWs, Buffer.from(JSON.stringify(unknownNotification)));
      }

      // Should not crash
      expect(heliusService.isWebSocketConnected()).toBe(true);
    });
  });

  describe('Subscription Confirmation', () => {
    it('should handle subscription confirmation response', async () => {
      await heliusService.initialize();

      const onMessageCallback = mockWs.on.mock.calls.find((call) => call[0] === 'message')?.[1];

      const signature = 'ConfirmationTestSignature';
      heliusService.monitorTransaction(signature, 30000);

      // Simulate subscription confirmation
      const confirmationResponse = {
        jsonrpc: '2.0',
        result: 1,
        id: 1,
      };

      if (onMessageCallback) {
        onMessageCallback.call(mockWs, Buffer.from(JSON.stringify(confirmationResponse)));
      }

      // Should not crash - confirmation should be logged
      expect(heliusService.isWebSocketConnected()).toBe(true);
    });
  });
});
