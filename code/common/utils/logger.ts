/**
 * Logger Utility
 * Provides consistent logging functionality throughout the Gateway Code application.
 */

import chalk from 'chalk';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerOptions {
  level: LogLevel;
  timestamp: boolean;
  colorize: boolean;
}

class Logger {
  private options: LoggerOptions = {
    level: 'info',
    timestamp: true,
    colorize: true
  };
  
  private readonly levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };
  
  /**
   * Configure the logger
   * @param options Logger options
   */
  configure(options: Partial<LoggerOptions>): void {
    this.options = { ...this.options, ...options };
  }
  
  /**
   * Log a debug message
   * @param message Main message
   * @param meta Optional metadata
   */
  debug(message: string, meta?: any): void {
    this.log('debug', message, meta);
  }
  
  /**
   * Log an info message
   * @param message Main message
   * @param meta Optional metadata
   */
  info(message: string, meta?: any): void {
    this.log('info', message, meta);
  }
  
  /**
   * Log a warning message
   * @param message Main message
   * @param meta Optional metadata
   */
  warn(message: string, meta?: any): void {
    this.log('warn', message, meta);
  }
  
  /**
   * Log an error message
   * @param message Main message
   * @param meta Optional metadata or Error object
   */
  error(message: string, meta?: any): void {
    this.log('error', message, meta);
  }
  
  /**
   * Internal logging method
   * @param level Log level
   * @param message Main message
   * @param meta Optional metadata
   */
  private log(level: LogLevel, message: string, meta?: any): void {
    // Skip logging if level is below configured level
    if (this.levelPriority[level] < this.levelPriority[this.options.level]) {
      return;
    }
    
    const timestamp = this.options.timestamp ? `[${new Date().toISOString()}] ` : '';
    
    let formattedMessage = `${timestamp}[${level.toUpperCase()}] ${message}`;
    
    // Apply colors if enabled
    if (this.options.colorize) {
      switch (level) {
        case 'debug':
          formattedMessage = chalk.gray(formattedMessage);
          break;
        case 'info':
          formattedMessage = chalk.blue(formattedMessage);
          break;
        case 'warn':
          formattedMessage = chalk.yellow(formattedMessage);
          break;
        case 'error':
          formattedMessage = chalk.red(formattedMessage);
          break;
      }
    }
    
    console.log(formattedMessage);
    
    // Log metadata if provided
    if (meta) {
      if (meta instanceof Error) {
        console.log(this.options.colorize ? chalk.red(meta.stack || meta.message) : meta.stack || meta.message);
      } else if (typeof meta === 'object') {
        console.log(meta);
      } else {
        console.log(meta);
      }
    }
  }
}

// Create a singleton instance
export const logger = new Logger();