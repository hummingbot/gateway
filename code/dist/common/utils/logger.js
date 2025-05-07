"use strict";
/**
 * Logger Utility
 * Provides consistent logging functionality throughout the Gateway Code application.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const chalk_1 = __importDefault(require("chalk"));
class Logger {
    constructor() {
        this.options = {
            level: 'info',
            timestamp: true,
            colorize: true
        };
        this.levelPriority = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3
        };
    }
    /**
     * Configure the logger
     * @param options Logger options
     */
    configure(options) {
        this.options = { ...this.options, ...options };
    }
    /**
     * Log a debug message
     * @param message Main message
     * @param meta Optional metadata
     */
    debug(message, meta) {
        this.log('debug', message, meta);
    }
    /**
     * Log an info message
     * @param message Main message
     * @param meta Optional metadata
     */
    info(message, meta) {
        this.log('info', message, meta);
    }
    /**
     * Log a warning message
     * @param message Main message
     * @param meta Optional metadata
     */
    warn(message, meta) {
        this.log('warn', message, meta);
    }
    /**
     * Log an error message
     * @param message Main message
     * @param meta Optional metadata or Error object
     */
    error(message, meta) {
        this.log('error', message, meta);
    }
    /**
     * Internal logging method
     * @param level Log level
     * @param message Main message
     * @param meta Optional metadata
     */
    log(level, message, meta) {
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
                    formattedMessage = chalk_1.default.gray(formattedMessage);
                    break;
                case 'info':
                    formattedMessage = chalk_1.default.blue(formattedMessage);
                    break;
                case 'warn':
                    formattedMessage = chalk_1.default.yellow(formattedMessage);
                    break;
                case 'error':
                    formattedMessage = chalk_1.default.red(formattedMessage);
                    break;
            }
        }
        console.log(formattedMessage);
        // Log metadata if provided
        if (meta) {
            if (meta instanceof Error) {
                console.log(this.options.colorize ? chalk_1.default.red(meta.stack || meta.message) : meta.stack || meta.message);
            }
            else if (typeof meta === 'object') {
                console.log(meta);
            }
            else {
                console.log(meta);
            }
        }
    }
}
// Create a singleton instance
exports.logger = new Logger();
//# sourceMappingURL=logger.js.map