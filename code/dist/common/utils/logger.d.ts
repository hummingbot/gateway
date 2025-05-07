/**
 * Logger Utility
 * Provides consistent logging functionality throughout the Gateway Code application.
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
interface LoggerOptions {
    level: LogLevel;
    timestamp: boolean;
    colorize: boolean;
}
declare class Logger {
    private options;
    private readonly levelPriority;
    /**
     * Configure the logger
     * @param options Logger options
     */
    configure(options: Partial<LoggerOptions>): void;
    /**
     * Log a debug message
     * @param message Main message
     * @param meta Optional metadata
     */
    debug(message: string, meta?: any): void;
    /**
     * Log an info message
     * @param message Main message
     * @param meta Optional metadata
     */
    info(message: string, meta?: any): void;
    /**
     * Log a warning message
     * @param message Main message
     * @param meta Optional metadata
     */
    warn(message: string, meta?: any): void;
    /**
     * Log an error message
     * @param message Main message
     * @param meta Optional metadata or Error object
     */
    error(message: string, meta?: any): void;
    /**
     * Internal logging method
     * @param level Log level
     * @param message Main message
     * @param meta Optional metadata
     */
    private log;
}
export declare const logger: Logger;
export {};
