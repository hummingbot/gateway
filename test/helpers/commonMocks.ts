/**
 * Common mock configurations used across multiple test files
 *
 * These mocks are extracted to eliminate duplication across test files.
 * Import and use in jest.mock() calls at module level.
 */

/**
 * Standard logger mock structure
 * Used in nearly all test files to mock the logger service
 */
export const createLoggerMock = () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  updateLoggerToStdout: jest.fn(),
});

/**
 * Standard ConfigManagerV2 mock structure
 * Used in tests that need to mock configuration management
 */
export const createConfigManagerMock = () => ({
  ConfigManagerV2: {
    getInstance: jest.fn().mockReturnValue({
      get: jest.fn(),
      set: jest.fn(),
    }),
  },
});
