import appRoot from 'app-root-path';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { LEVEL, MESSAGE } from 'triple-beam';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

import { ConfigManagerV2 } from './config-manager-v2';
dayjs.extend(utc);

const errorsWithStack = winston.format((einfo) => {
  if (einfo instanceof Error) {
    const info = Object.assign({}, einfo, {
      level: einfo.level,
      [LEVEL]: einfo[LEVEL] || einfo.level,
      message: einfo.message,
      [MESSAGE]: einfo[MESSAGE] || einfo.message,
      stack: `\n${einfo.stack}` || '',
    });
    return info;
  }
  return einfo;
});

export const getLocalDate = () => {
  const gmtOffsetHours = ConfigManagerV2.getInstance().get('server.GMTOffset');
  const offsetMinutes = gmtOffsetHours * 60;
  return dayjs().utcOffset(offsetMinutes, false).format('YYYY-MM-DD HH:mm:ss');
};

/**
 * Redact sensitive information (API keys) from URLs for logging
 * @param url - The URL that may contain sensitive information
 * @returns URL with API keys redacted
 */
export const redactUrl = (url: string): string => {
  if (!url) return url;

  let redacted = url;

  // Redact query parameter API keys (e.g., ?api-key=XXX, ?apiKey=XXX, ?apikey=XXX)
  redacted = redacted.replace(/([?&]api[-_]?key=)[^&]+/gi, '$1***');

  // Redact Infura-style path API keys (e.g., /v3/API_KEY)
  // Match 32 characters of alphanumeric after /v3/
  redacted = redacted.replace(/(\/v3\/)([a-zA-Z0-9]{32})($|\/|\?)/gi, '$1***$3');

  return redacted;
};

const logFileFormat = winston.format.combine(
  winston.format.errors({ stack: true }),
  winston.format.align(),
  errorsWithStack(),
  winston.format.printf((info) => {
    const localDate = getLocalDate();
    let output = info.message;

    // Handle metadata (additional arguments)
    if (Object.keys(info).length > 2) {
      // more than just 'message' and 'level'
      const metaData = { ...info };
      delete metaData.message;
      delete metaData.level;
      delete metaData.stack;
      delete metaData[LEVEL];
      delete metaData[MESSAGE];

      output += ' ' + JSON.stringify(metaData, null, 2);
    }

    return info.stack
      ? `${localDate} | ${info.level} | ${output} | ${info.stack}`
      : `${localDate} | ${info.level} | ${output}`;
  }),
);

const sdtoutFormat = winston.format.combine(
  winston.format.printf((info) => {
    const localDate = getLocalDate();
    let output = info.message;

    // Handle metadata (additional arguments)
    if (Object.keys(info).length > 2) {
      // more than just 'message' and 'level'
      const metaData = { ...info };
      delete metaData.message;
      delete metaData.level;
      delete metaData.stack;
      delete metaData[LEVEL];
      delete metaData[MESSAGE];

      output += ' ' + JSON.stringify(metaData, null, 2);
    }

    return `${localDate} | ${info.level} | ${output}`;
  }),
);

const getLogPath = () => {
  const configPath = ConfigManagerV2.getInstance().get('server.logPath');
  return configPath || [appRoot.path, 'logs'].join('/');
};

const allLogsFileTransport = new DailyRotateFile({
  level: ConfigManagerV2.getInstance().get('server.logLevel') || 'info',
  filename: `${getLogPath()}/logs_gateway_app.log.%DATE%`,
  datePattern: 'YYYY-MM-DD',
  handleExceptions: true,
  handleRejections: true,
});

export const logger = winston.createLogger({
  level: ConfigManagerV2.getInstance().get('server.logLevel') || 'info',
  format: logFileFormat,
  exitOnError: false,
  transports: [allLogsFileTransport],
});

const toStdout = new winston.transports.Console({
  level: ConfigManagerV2.getInstance().get('server.logLevel') || 'info',
  format: sdtoutFormat,
});

export const updateLoggerToStdout = () => {
  ConfigManagerV2.getInstance().get('server.logToStdOut') === true ? logger.add(toStdout) : logger.remove(toStdout);
};

// Initialize logger with stdout configuration
updateLoggerToStdout();
