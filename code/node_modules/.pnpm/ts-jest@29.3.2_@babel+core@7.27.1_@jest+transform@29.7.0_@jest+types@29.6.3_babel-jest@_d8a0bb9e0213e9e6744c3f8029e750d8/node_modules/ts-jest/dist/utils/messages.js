"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TsJestDiagnosticCodes = void 0;
exports.interpolate = interpolate;
/**
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function interpolate(msg, vars) {
    if (vars === void 0) { vars = {}; }
    // eslint-disable-next-line no-useless-escape
    return msg.replace(/\{\{([^\}]+)\}\}/g, function (_, key) { return (key in vars ? vars[key] : _); });
}
exports.TsJestDiagnosticCodes = {
    Generic: 151000,
    ConfigModuleOption: 151001,
};
