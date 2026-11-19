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

// A URL anywhere in a piece of text: scheme, optional userinfo, host[:port], then the rest up
// to whitespace or a quote.
const URL_IN_TEXT = /\b((?:https?|wss?):\/\/)(?:[^/\s"'`@]*@)?([A-Za-z0-9.\-[\]:]+)[^\s"'`]*/gi;

/**
 * Cut every http(s)/ws(s) URL in a piece of text down to its scheme and host.
 *
 * RPC providers put the access key in the userinfo, the path or the query, each in their own
 * way, so a list of known key shapes lets through every provider it has not heard of. The
 * host alone never carries the key and still says which endpoint is in use.
 */
export const redactUrl = (url: string | null | undefined): string => {
  if (!url) return url ?? '';
  return url.replace(URL_IN_TEXT, '$1$2');
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
      ? redactUrl(`${localDate} | ${info.level} | ${output} | ${info.stack}`)
      : redactUrl(`${localDate} | ${info.level} | ${output}`);
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

    return redactUrl(`${localDate} | ${info.level} | ${output}`);
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
  if (ConfigManagerV2.getInstance().get('server.logToStdOut') === true) {
    logger.add(toStdout);
  } else {
    logger.remove(toStdout);
  }
};

// Initialize logger with stdout configuration
updateLoggerToStdout();
