"use strict";
/**
 * Base Tool
 * Abstract base class for all Gateway tools.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseTool = void 0;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../mcp/config");
const logger_1 = require("../../common/utils/logger");
class BaseTool {
    constructor(config) {
        this.config = config;
    }
    /**
     * Helper method to call Gateway API endpoints
     * @param endpoint Gateway API endpoint (without leading slash)
     * @param method HTTP method
     * @param data Request data
     * @returns API response
     */
    async callGatewayApi(endpoint, method = 'GET', data) {
        const baseUrl = (0, config_1.getGatewayApiBaseUrl)(this.config);
        const url = `${baseUrl}/${endpoint}`;
        try {
            logger_1.logger.debug(`Calling Gateway API: ${method} ${url}`);
            if (data) {
                logger_1.logger.debug(`Request data: ${JSON.stringify(data)}`);
            }
            const response = await (0, axios_1.default)({
                method,
                url,
                data,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            logger_1.logger.debug(`Gateway API response: ${JSON.stringify(response.data)}`);
            return response.data;
        }
        catch (error) {
            logger_1.logger.error(`Error calling Gateway API: ${error.message}`);
            if (axios_1.default.isAxiosError(error) && error.response) {
                logger_1.logger.error(`Response status: ${error.response.status}`);
                logger_1.logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
                throw new Error(`Gateway API error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    }
    /**
     * Get tool metadata for registration
     * @returns Tool metadata
     */
    getMetadata() {
        return {
            name: this.name,
            description: this.description,
            category: this.category
        };
    }
}
exports.BaseTool = BaseTool;
//# sourceMappingURL=base-tool.js.map