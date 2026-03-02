/**
 * Minimal vscode module mock for unit tests running outside the VS Code extension host.
 * This file is required via .mocharc.yml before any tests load.
 *
 * It intercepts `require('vscode')` by hooking into Node's module resolution.
 */

type Listener = (...args: any[]) => any;

class MockEventEmitter {
    private listeners: Listener[] = [];
    readonly event = (listener: Listener) => {
        this.listeners.push(listener);
        return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
    };
    fire(data: any) {
        for (const l of this.listeners) { l(data); }
    }
    dispose() { this.listeners = []; }
}

class MockFileSystemWatcher {
    private _onDidChange = new MockEventEmitter();
    private _onDidCreate = new MockEventEmitter();
    private _onDidDelete = new MockEventEmitter();
    readonly onDidChange = this._onDidChange.event;
    readonly onDidCreate = this._onDidCreate.event;
    readonly onDidDelete = this._onDidDelete.event;
    dispose() {
        this._onDidChange.dispose();
        this._onDidCreate.dispose();
        this._onDidDelete.dispose();
    }
}

class MockTreeItem {
    label: string;
    collapsibleState?: number;
    iconPath?: any;
    description?: string;
    contextValue?: string;
    constructor(label: string, collapsibleState?: number) {
        this.label = label;
        this.collapsibleState = collapsibleState;
    }
}

class MockThemeIcon {
    constructor(public id: string, public color?: any) {}
}

class MockThemeColor {
    constructor(public id: string) {}
}

const TreeItemCollapsibleState = {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
};

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
    ProgressLocation: {
        SourceControl: 1,
        Window: 10,
        Notification: 15,
    },
    EventEmitter: MockEventEmitter,
    RelativePattern: class { constructor(public base: any, public pattern: string) {} },
    commands: {
        executeCommand: async () => {},
    },
    workspace: {
        fs: {
            readDirectory: async () => [],
            readFile: async () => Buffer.from(''),
            writeFile: async () => {},
            createDirectory: async () => {},
            delete: async () => {},
        },
        createFileSystemWatcher: () => new MockFileSystemWatcher(),
        openTextDocument: async (options: any) => ({
            uri: { fsPath: 'untitled:mock', path: 'untitled:mock', scheme: 'untitled' },
            getText: () => options?.content ?? '',
        }),
    },
    authentication: {
        getSession: async () => undefined,
    },
    window: {
        showInformationMessage: async () => undefined,
        showWarningMessage: async () => undefined,
        showErrorMessage: async () => undefined,
        withProgress: async (_options: any, task: any) => {
            const progress = { report: () => {} };
            const token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) };
            return task(progress, token);
        },
    },
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
    TreeItem: MockTreeItem,
    TreeItemCollapsibleState,
    ThemeIcon: MockThemeIcon,
    ThemeColor: MockThemeColor,
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
