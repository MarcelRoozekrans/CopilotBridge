import * as vscode from 'vscode';
import { SkillInfo, PluginInfo, SkillStatus } from './types';
import { BridgeManifest } from './types';
import { computeHash, isSkillImported, isSkillOutdated } from './stateManager';

export type TreeItemType = 'plugin' | 'skill';

export class SkillTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly itemType: TreeItemType,
        public readonly pluginInfo?: PluginInfo,
        public readonly skillInfo?: SkillInfo,
        public readonly status?: SkillStatus,
        collapsibleState?: vscode.TreeItemCollapsibleState,
    ) {
        super(label, collapsibleState ?? vscode.TreeItemCollapsibleState.None);

        if (itemType === 'plugin') {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            this.iconPath = new vscode.ThemeIcon('package');
            const src = pluginInfo?.source === 'local' ? 'local' : pluginInfo?.source === 'remote' ? 'remote' : 'local + remote';
            this.description = `v${pluginInfo?.version ?? '?'} [${src}]`;
            this.contextValue = 'plugin';
        } else if (itemType === 'skill') {
            this.contextValue = `skill-${status}`;
            switch (status) {
                case 'synced':
                    this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
                    this.description = 'synced';
                    break;
                case 'available':
                    this.iconPath = new vscode.ThemeIcon('cloud-download');
                    this.description = 'available';
                    break;
                case 'update-available':
                    this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
                    this.description = 'update available';
                    break;
                case 'conflict':
                    this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('list.errorForeground'));
                    this.description = 'conflict';
                    break;
            }
        }
    }
}

export class SkillBridgeTreeProvider implements vscode.TreeDataProvider<SkillTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<SkillTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private plugins: PluginInfo[] = [];
    private manifest: BridgeManifest = { skills: {}, mcpServers: {}, marketplaces: [], settings: { checkInterval: 86400, autoAcceptUpdates: false } };

    setData(plugins: PluginInfo[], manifest: BridgeManifest) {
        this.plugins = plugins;
        this.manifest = manifest;
        this._onDidChangeTreeData.fire();
    }

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: SkillTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: SkillTreeItem): SkillTreeItem[] {
        if (!element) {
            return this.plugins.map(p => new SkillTreeItem(p.name, 'plugin', p));
        }

        if (element.itemType === 'plugin' && element.pluginInfo) {
            return element.pluginInfo.skills.map(skill => {
                const hash = computeHash(skill.content);
                let status: SkillStatus;

                if (!isSkillImported(this.manifest, skill.name)) {
                    status = 'available';
                } else if (isSkillOutdated(this.manifest, skill.name, hash)) {
                    const state = this.manifest.skills[skill.name];
                    status = state.locallyModified ? 'conflict' : 'update-available';
                } else {
                    status = 'synced';
                }

                return new SkillTreeItem(skill.name, 'skill', element.pluginInfo, skill, status);
            });
        }

        return [];
    }
}
