import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { BridgeManifest } from './types';
import { fetchLatestCommitSha } from './remoteReader';
import { getLogger } from './logger';

export class UpdateWatcher implements vscode.Disposable {
    private localWatcher: vscode.FileSystemWatcher | undefined;
    private remoteTimer: ReturnType<typeof setInterval> | undefined;
    private disposables: vscode.Disposable[] = [];

    private _onLocalChange = new vscode.EventEmitter<string>();
    readonly onLocalChange = this._onLocalChange.event;

    private _onRemoteChange = new vscode.EventEmitter<{ repo: string; newSha: string }>();
    readonly onRemoteChange = this._onRemoteChange.event;

    constructor(private cachePath: string) {}

    startLocalWatcher() {
        const resolvedPath = this.cachePath.startsWith('~')
            ? path.join(os.homedir(), this.cachePath.slice(1))
            : this.cachePath;

        const pattern = new vscode.RelativePattern(
            vscode.Uri.file(resolvedPath),
            '**/SKILL.md'
        );

        this.localWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        this.localWatcher.onDidChange(uri => {
            this._onLocalChange.fire(uri.fsPath);
        });

        this.localWatcher.onDidCreate(uri => {
            this._onLocalChange.fire(uri.fsPath);
        });

        this.disposables.push(this.localWatcher);
    }

    startRemoteChecker(repos: string[], intervalSeconds: number, manifest: BridgeManifest) {
        this.stopRemoteChecker();

        const check = async () => {
            for (const repo of repos) {
                try {
                    const latestSha = await fetchLatestCommitSha(repo);
                    const entry = manifest.marketplaces.find(m => m.repo === repo);
                    if (entry && entry.lastChecked !== latestSha) {
                        this._onRemoteChange.fire({ repo, newSha: latestSha });
                    }
                } catch (err) {
                    getLogger().warn('updateWatcher.remoteChecker: poll failure', err);
                }
            }
        };

        check();

        this.remoteTimer = setInterval(check, intervalSeconds * 1000);
    }

    stopRemoteChecker() {
        if (this.remoteTimer) {
            clearInterval(this.remoteTimer);
            this.remoteTimer = undefined;
        }
    }

    dispose() {
        this.stopRemoteChecker();
        this._onLocalChange.dispose();
        this._onRemoteChange.dispose();
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}
