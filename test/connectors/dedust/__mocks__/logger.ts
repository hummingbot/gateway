import winston from 'winston';

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

export const updateLoggerToStdout = jest.fn();
export const telemetry = jest.fn(); 