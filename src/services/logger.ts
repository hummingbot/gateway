import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import appRoot from 'app-root-path';
import { ConfigManagerV2 } from './config-manager-v2';
dayjs.extend(utc);

const { LEVEL, MESSAGE } = require('triple-beam');

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

const logFileFormat = winston.format.combine(
  winston.format.errors({ stack: true }),
  winston.format.align(),
  errorsWithStack(),
  winston.format.printf((info) => {
    const localDate = getLocalDate();
    let output = info.message;
    
    // Handle metadata (additional arguments)
    if (Object.keys(info).length > 2) {  // more than just 'message' and 'level'
      const metaData = {...info};
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
  })
);

const sdtoutFormat = winston.format.combine(
  winston.format.printf((info) => {
    const localDate = getLocalDate();
    let output = info.message;
    
    // Handle metadata (additional arguments)
    if (Object.keys(info).length > 2) {  // more than just 'message' and 'level'
      const metaData = {...info};
      delete metaData.message;
      delete metaData.level;
      delete metaData.stack;
      delete metaData[LEVEL];
      delete metaData[MESSAGE];
      
      output += ' ' + JSON.stringify(metaData, null, 2);
    }
    
    return `${localDate} | ${info.level} | ${output}`;
  })
);

const getLogPath = () => {
  const configPath = ConfigManagerV2.getInstance().get('server.logPath');
  return configPath || [appRoot.path, 'logs'].join('/');
};

const allLogsFileTransport = new DailyRotateFile({
  level: 'info',
  filename: `${getLogPath()}/logs_gateway_app.log.%DATE%`,
  datePattern: 'YYYY-MM-DD',
  handleExceptions: true,
  handleRejections: true,
});

export const logger = winston.createLogger({
  level: 'info',
  format: logFileFormat,
  exitOnError: false,
  transports: [allLogsFileTransport],
});

const toStdout = new winston.transports.Console({
  format: sdtoutFormat,
});

export const updateLoggerToStdout = () => {
  ConfigManagerV2.getInstance().get('server.logToStdOut') === true
    ? logger.add(toStdout)
    : logger.remove(toStdout);
};

updateLoggerToStdout();
