/**
 * Minimal vscode module mock for unit tests running outside the VS Code extension host.
 * This file is required via .mocharc.yml before any tests load.
 *
 * It intercepts `require('vscode')` by hooking into Node's module resolution.
 */

const vscodeMock = {
    Uri: {
        file: (p: string) => ({ fsPath: p, path: p }),
        joinPath: (base: { fsPath: string }, ...parts: string[]) => {
            const joined = [base.fsPath, ...parts].join('/');
            return { fsPath: joined, path: joined };
        },
    },
    FileType: {
        Unknown: 0,
        File: 1,
        Directory: 2,
        SymbolicLink: 64,
    },
    workspace: {
        fs: {
            readDirectory: async () => [],
            readFile: async () => Buffer.from(''),
            writeFile: async () => {},
            createDirectory: async () => {},
        },
    },
};

// Hook into Module._resolveFilename to intercept 'vscode' requires
const Module = require('module');
const origResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
    if (request === 'vscode') {
        return 'vscode';
    }
    return origResolveFilename.call(this, request, parent, isMain, options);
};

// Pre-populate require cache with our mock
require.cache['vscode'] = {
    id: 'vscode',
    filename: 'vscode',
    loaded: true,
    exports: vscodeMock,
    parent: null,
    children: [],
    path: '',
    paths: [],
} as any;
