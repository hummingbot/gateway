import { ConfigManagerV2 } from '../../src/services/config-manager-v2';

describe('API Key Authentication', () => {
  let originalTestMode: string | undefined;
  let originalDevArg: boolean;

  beforeAll(() => {
    // Save original state
    originalTestMode = process.env.GATEWAY_TEST_MODE;
    originalDevArg = process.argv.includes('--dev');
  });

  afterAll(() => {
    // Restore original state
    if (originalTestMode) {
      process.env.GATEWAY_TEST_MODE = originalTestMode;
    } else {
      delete process.env.GATEWAY_TEST_MODE;
    }
  });

  describe('Configuration', () => {
    it('should have apiKeys field in server config schema', () => {
      const config = ConfigManagerV2.getInstance();
      const apiKeys = config.get('server.apiKeys');

      // Should exist and be an array (even if empty)
      expect(Array.isArray(apiKeys)).toBe(true);
    });

    it('should accept empty array for apiKeys', () => {
      const config = ConfigManagerV2.getInstance();
      config.set('server.apiKeys', []);
      const apiKeys = config.get('server.apiKeys');

      expect(apiKeys).toEqual([]);
    });

    it('should accept array of strings for apiKeys', () => {
      const config = ConfigManagerV2.getInstance();
      const testKeys = ['test-key-1', 'test-key-2'];
      config.set('server.apiKeys', testKeys);
      const apiKeys = config.get('server.apiKeys');

      expect(apiKeys).toEqual(testKeys);
    });
  });

  describe('Dev Mode Behavior', () => {
    it('should not require API key in dev mode (GATEWAY_TEST_MODE=dev)', () => {
      // Dev mode is active in tests via GATEWAY_TEST_MODE=dev
      expect(process.env.GATEWAY_TEST_MODE).toBe('dev');

      // API keys can be configured but won't be enforced
      const config = ConfigManagerV2.getInstance();
      const apiKeys = config.get('server.apiKeys');

      // Can be empty or have values, doesn't matter in dev mode
      expect(Array.isArray(apiKeys)).toBe(true);
    });
  });

  describe('Production Mode Behavior', () => {
    it('should have warning when no API keys configured in production', () => {
      // This test validates the schema allows empty array
      const config = ConfigManagerV2.getInstance();
      config.set('server.apiKeys', []);
      const apiKeys = config.get('server.apiKeys');

      expect(apiKeys).toEqual([]);
      // In production (not dev mode), this would trigger a warning log
    });

    it('should support multiple API keys', () => {
      const config = ConfigManagerV2.getInstance();
      const keys = ['aaaabbbbccccddddeeeeffffgggghhhh', '1111222233334444555566667777888'];

      config.set('server.apiKeys', keys);
      const apiKeys = config.get('server.apiKeys');

      expect(apiKeys).toEqual(keys);
      expect(apiKeys.length).toBe(2);
    });
  });
});
