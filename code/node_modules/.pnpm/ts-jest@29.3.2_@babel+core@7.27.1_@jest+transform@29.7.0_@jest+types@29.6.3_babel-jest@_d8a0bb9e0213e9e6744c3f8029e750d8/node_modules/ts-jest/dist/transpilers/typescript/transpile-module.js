"use strict";
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tsTranspileModule = exports.isModernNodeModuleKind = void 0;
var node_path_1 = __importDefault(require("node:path"));
var typescript_1 = __importDefault(require("typescript"));
var messages_1 = require("../../utils/messages");
var barebonesLibContent = "/// <reference no-default-lib=\"true\"/>\ninterface Boolean {}\ninterface Function {}\ninterface CallableFunction {}\ninterface NewableFunction {}\ninterface IArguments {}\ninterface Number {}\ninterface Object {}\ninterface RegExp {}\ninterface String {}\ninterface Array<T> { length: number; [n: number]: T; }\ninterface SymbolConstructor {\n    (desc?: string | number): symbol;\n    for(name: string): symbol;\n    readonly toStringTag: symbol;\n}\ndeclare var Symbol: SymbolConstructor;\ninterface Symbol {\n    readonly [Symbol.toStringTag]: string;\n}";
var barebonesLibName = 'lib.d.ts';
var barebonesLibSourceFile;
var carriageReturnLineFeed = '\r\n';
var lineFeed = '\n';
function getNewLineCharacter(options) {
    switch (options.newLine) {
        case typescript_1.default.NewLineKind.CarriageReturnLineFeed:
            return carriageReturnLineFeed;
        case typescript_1.default.NewLineKind.LineFeed:
        default:
            return lineFeed;
    }
}
var isModernNodeModuleKind = function (module) {
    return module ? [typescript_1.default.ModuleKind.Node16, /* ModuleKind.Node18 */ 101, typescript_1.default.ModuleKind.NodeNext].includes(module) : false;
};
exports.isModernNodeModuleKind = isModernNodeModuleKind;
var shouldCheckProjectPkgJsonContent = function (fileName, moduleKind) {
    return fileName.endsWith('package.json') && (0, exports.isModernNodeModuleKind)(moduleKind);
};
/**
 * Copy source code of {@link ts.transpileModule} from {@link https://github.com/microsoft/TypeScript/blob/main/src/services/transpile.ts}
 * with extra modifications:
 * - Remove generation of declaration files
 * - Allow using custom AST transformers with the internal created {@link Program}
 */
var transpileWorker = function (input, transpileOptions) {
    var e_1, _a;
    var _b, _c, _d, _e, _f;
    barebonesLibSourceFile !== null && barebonesLibSourceFile !== void 0 ? barebonesLibSourceFile : (barebonesLibSourceFile = typescript_1.default.createSourceFile(barebonesLibName, barebonesLibContent, {
        languageVersion: typescript_1.default.ScriptTarget.Latest,
    }));
    var diagnostics = [];
    var options = transpileOptions.compilerOptions
        ? // @ts-expect-error internal TypeScript API
            typescript_1.default.fixupCompilerOptions(transpileOptions.compilerOptions, diagnostics)
        : {};
    // mix in default options
    var defaultOptions = typescript_1.default.getDefaultCompilerOptions();
    for (var key in defaultOptions) {
        if (Object.hasOwn(defaultOptions, key) && options[key] === undefined) {
            options[key] = defaultOptions[key];
        }
    }
    try {
        // @ts-expect-error internal TypeScript API
        for (var _g = __values(typescript_1.default.transpileOptionValueCompilerOptions), _h = _g.next(); !_h.done; _h = _g.next()) {
            var option = _h.value;
            // Do not set redundant config options if `verbatimModuleSyntax` was supplied.
            if (options.verbatimModuleSyntax && new Set(['isolatedModules']).has(option.name)) {
                continue;
            }
            options[option.name] = option.transpileOptionValue;
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (_h && !_h.done && (_a = _g.return)) _a.call(_g);
        }
        finally { if (e_1) throw e_1.error; }
    }
    // transpileModule does not write anything to disk so there is no need to verify that there are no conflicts between input and output paths.
    options.suppressOutputPathCheck = true;
    // Filename can be non-ts file.
    options.allowNonTsExtensions = true;
    options.declaration = false;
    options.declarationMap = false;
    var newLine = getNewLineCharacter(options);
    // if jsx is specified then treat file as .tsx
    var inputFileName = (_b = transpileOptions.fileName) !== null && _b !== void 0 ? _b : (((_c = transpileOptions.compilerOptions) === null || _c === void 0 ? void 0 : _c.jsx) ? 'module.tsx' : 'module.ts');
    // Create a compilerHost object to allow the compiler to read and write files
    var compilerHost = {
        getSourceFile: function (fileName) {
            // @ts-expect-error internal TypeScript API
            if (fileName === typescript_1.default.normalizePath(inputFileName)) {
                return sourceFile;
            }
            // @ts-expect-error internal TypeScript API
            return fileName === typescript_1.default.normalizePath(barebonesLibName) ? barebonesLibSourceFile : undefined;
        },
        writeFile: function (name, text) {
            if (node_path_1.default.extname(name) === '.map') {
                sourceMapText = text;
            }
            else {
                outputText = text;
            }
        },
        getDefaultLibFileName: function () { return barebonesLibName; },
        useCaseSensitiveFileNames: function () { return false; },
        getCanonicalFileName: function (fileName) { return fileName; },
        getCurrentDirectory: function () { return ''; },
        getNewLine: function () { return newLine; },
        fileExists: function (fileName) {
            if (shouldCheckProjectPkgJsonContent(fileName, options.module)) {
                return typescript_1.default.sys.fileExists(fileName);
            }
            return fileName === inputFileName;
        },
        readFile: function (fileName) {
            if (shouldCheckProjectPkgJsonContent(fileName, options.module)) {
                return typescript_1.default.sys.readFile(fileName);
            }
            return '';
        },
        directoryExists: function () { return true; },
        getDirectories: function () { return []; },
    };
    var sourceFile = typescript_1.default.createSourceFile(inputFileName, input, {
        languageVersion: (_d = options.target) !== null && _d !== void 0 ? _d : typescript_1.default.ScriptTarget.ESNext,
        impliedNodeFormat: typescript_1.default.getImpliedNodeFormatForFile(inputFileName, 
        /*packageJsonInfoCache*/ undefined, compilerHost, options),
        // @ts-expect-error internal TypeScript API
        setExternalModuleIndicator: typescript_1.default.getSetExternalModuleIndicator(options),
        jsDocParsingMode: (_e = transpileOptions.jsDocParsingMode) !== null && _e !== void 0 ? _e : typescript_1.default.JSDocParsingMode.ParseAll,
    });
    if (transpileOptions.moduleName) {
        sourceFile.moduleName = transpileOptions.moduleName;
    }
    if (transpileOptions.renamedDependencies) {
        // @ts-expect-error internal TypeScript API
        sourceFile.renamedDependencies = new Map(Object.entries(transpileOptions.renamedDependencies));
    }
    // Output
    var outputText;
    var sourceMapText;
    var inputs = [inputFileName];
    var program = typescript_1.default.createProgram(inputs, options, compilerHost);
    if (transpileOptions.reportDiagnostics) {
        diagnostics.push.apply(diagnostics, __spreadArray([], __read(program.getSyntacticDiagnostics(sourceFile)), false));
    }
    diagnostics.push.apply(diagnostics, __spreadArray([], __read(program.getOptionsDiagnostics()), false));
    // Emit
    var result = program.emit(
    /*targetSourceFile*/ undefined, 
    /*writeFile*/ undefined, 
    /*cancellationToken*/ undefined, 
    /*emitOnlyDtsFiles*/ undefined, (_f = transpileOptions.transformers) === null || _f === void 0 ? void 0 : _f.call(transpileOptions, program));
    diagnostics.push.apply(diagnostics, __spreadArray([], __read(result.diagnostics), false));
    if (outputText === undefined) {
        diagnostics.push({
            category: typescript_1.default.DiagnosticCategory.Error,
            code: messages_1.TsJestDiagnosticCodes.Generic,
            messageText: 'No output generated',
            file: sourceFile,
            start: 0,
            length: 0,
        });
    }
    return { outputText: outputText !== null && outputText !== void 0 ? outputText : '', diagnostics: diagnostics, sourceMapText: sourceMapText };
};
exports.tsTranspileModule = transpileWorker;
