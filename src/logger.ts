import * as vscode from 'vscode';

type LogLevel = 'DEBUG' | 'WARN' | 'ERROR';

export class Logger {
    constructor(private channel: vscode.OutputChannel) {}

    debug(context: string, err?: unknown): void {
        this.log('DEBUG', context, err);
    }

    warn(context: string, err?: unknown): void {
        this.log('WARN', context, err);
    }

    error(context: string, err?: unknown): void {
        this.log('ERROR', context, err);
    }

    private log(level: LogLevel, context: string, err?: unknown): void {
        const timestamp = new Date().toISOString();
        const errMsg = err !== undefined
            ? `: ${err instanceof Error ? err.message : String(err)}`
            : '';
        this.channel.appendLine(`[${timestamp}] [${level}] ${context}${errMsg}`);
    }
}

let instance: Logger | undefined;

export function initLogger(channel: vscode.OutputChannel): Logger {
    instance = new Logger(channel);
    return instance;
}

export function getLogger(): Logger {
    if (!instance) {
        throw new Error('Logger not initialized. Call initLogger() first.');
    }
    return instance;
}
