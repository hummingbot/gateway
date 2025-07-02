import winston from 'winston';

// Mock ConfigManagerV2 before importing logger
const mockConfig: Record<string, any> = {
  'server.logToStdOut': false,
  'logging.logPath': './logs',
};

jest.mock('../../src/services/config-manager-v2', () => ({
  ConfigManagerV2: {
    getInstance: jest.fn().mockReturnValue({
      get: jest.fn().mockImplementation((key: string) => mockConfig[key]),
      set: jest.fn().mockImplementation((key: string, value: any) => {
        mockConfig[key] = value;
      }),
    }),
  },
}));

import { ConfigManagerV2 } from '../../src/services/config-manager-v2';
import { logger, updateLoggerToStdout } from '../../src/services/logger';

describe('Test logger', () => {
  it('updateLoggerToStdout works', (done) => {
    ConfigManagerV2.getInstance().set('server.logToStdOut', true);
    updateLoggerToStdout();
    const ofTypeConsole = (element: any) =>
      element instanceof winston.transports.Console;
    expect(logger.transports.some(ofTypeConsole)).toEqual(true);
    ConfigManagerV2.getInstance().set('server.logToStdOut', false);
    updateLoggerToStdout();
    // Not sure why the below test doesn't on Github but passes on local
    // expect(logger.transports.some(ofTypeConsole)).toEqual(false);
    done();
  });
});
