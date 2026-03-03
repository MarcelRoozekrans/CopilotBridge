import * as vscode from 'vscode';
import { SkillInfo, PluginInfo, SkillStatus, McpServerInfo } from './types';
import { BridgeManifest } from './types';
import { computeHash, isSkillImported, isSkillOutdated } from './stateManager';
import { analyzeCompatibility } from './compatAnalyzer';

export type TreeItemType = 'marketplace' | 'plugin' | 'skill' | 'mcpGroup' | 'mcpServer';

export class SkillTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly itemType: TreeItemType,
        public readonly pluginInfo?: PluginInfo,
        public readonly skillInfo?: SkillInfo,
        public readonly status?: SkillStatus,
        collapsibleState?: vscode.TreeItemCollapsibleState,
        public readonly mcpServerInfo?: McpServerInfo,
        public readonly marketplaceRepo?: string,
    ) {
        super(label, collapsibleState ?? vscode.TreeItemCollapsibleState.None);

        if (itemType === 'marketplace') {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            this.iconPath = new vscode.ThemeIcon('repo');
            this.contextValue = 'marketplace';
            this.tooltip = `Marketplace: ${marketplaceRepo ?? label}`;
        } else if (itemType === 'plugin') {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            this.iconPath = new vscode.ThemeIcon('package');
            const src = pluginInfo?.source === 'local' ? 'local' : pluginInfo?.source === 'remote' ? 'remote' : 'local + remote';
            this.description = `v${pluginInfo?.version ?? '?'} [${src}]`;
            this.contextValue = 'plugin';
            this.tooltip = pluginInfo?.description ?? label;
        } else if (itemType === 'skill') {
            this.contextValue = `skill-${status}`;
            this.tooltip = skillInfo?.description ?? label;
            if (skillInfo) {
                this.command = {
                    command: 'copilotSkillBridge.showSkillContent',
                    title: 'Show Skill Content',
                    arguments: [this],
                };
            }
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
                case 'incompatible':
                    this.iconPath = new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('disabledForeground'));
                    break;
            }
        } else if (itemType === 'mcpGroup') {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            this.iconPath = new vscode.ThemeIcon('plug');
            this.contextValue = 'mcpGroup';
            this.tooltip = 'MCP servers provided by this plugin';
        } else if (itemType === 'mcpServer') {
            this.contextValue = `mcpServer-${status}`;
            const serverDetail = mcpServerInfo?.config.command
                ? `Command: ${mcpServerInfo.config.command} ${(mcpServerInfo.config.args ?? []).join(' ')}`.trim()
                : mcpServerInfo?.config.url ?? '';
            this.tooltip = serverDetail || label;
            if (status === 'synced') {
                this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
                this.description = 'imported';
            } else {
                this.iconPath = new vscode.ThemeIcon('cloud-download');
                this.description = 'available';
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
            return this.getRootNodes();
        }

        if (element.itemType === 'marketplace') {
            const repo = element.marketplaceRepo!;
            return this.plugins
                .filter(p => p.marketplace === repo)
                .map(p => new SkillTreeItem(p.name, 'plugin', p));
        }

        if (element.itemType === 'plugin' && element.pluginInfo) {
            return this.getPluginChildren(element.pluginInfo);
        }

        if (element.itemType === 'mcpGroup' && element.pluginInfo) {
            const servers = element.pluginInfo.mcpServers ?? [];
            return servers.map(srv => {
                const imported = srv.name in (this.manifest.mcpServers ?? {});
                const status: SkillStatus = imported ? 'synced' : 'available';
                return new SkillTreeItem(srv.name, 'mcpServer', element.pluginInfo, undefined, status, undefined, srv);
            });
        }

        return [];
    }

    private getRootNodes(): SkillTreeItem[] {
        const byMarketplace = new Map<string, PluginInfo[]>();
        for (const p of this.plugins) {
            const key = p.marketplace;
            const list = byMarketplace.get(key) ?? [];
            list.push(p);
            byMarketplace.set(key, list);
        }

        const items: SkillTreeItem[] = [];
        for (const [repo, plugins] of byMarketplace) {
            if (plugins.length === 1) {
                items.push(new SkillTreeItem(plugins[0].name, 'plugin', plugins[0]));
            } else {
                const node = new SkillTreeItem(repo, 'marketplace', undefined, undefined, undefined, undefined, undefined, repo);
                node.description = `${plugins.length} plugins`;
                items.push(node);
            }
        }

        return items;
    }

    private getPluginChildren(plugin: PluginInfo): SkillTreeItem[] {
        const children: SkillTreeItem[] = [];
        const pluginMcpServers = plugin.mcpServers ?? [];

        for (const skill of plugin.skills) {
            const compat = analyzeCompatibility(skill, pluginMcpServers, this.manifest.mcpServers ?? {}, {});

            if (!compat.compatible) {
                const item = new SkillTreeItem(skill.name, 'skill', plugin, skill, 'incompatible');
                item.description = compat.issues[0] ?? 'incompatible';
                children.push(item);
                continue;
            }

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

            const item = new SkillTreeItem(skill.name, 'skill', plugin, skill, status);

            if (status === 'synced' && this.manifest.skills[skill.name]?.embedded) {
                item.iconPath = new vscode.ThemeIcon('pin', new vscode.ThemeColor('testing.iconPassed'));
                item.description = 'always active';
                item.contextValue = 'skill-synced-embedded';
            }

            children.push(item);
        }

        const mcpServers = plugin.mcpServers ?? [];
        if (mcpServers.length > 0) {
            children.push(new SkillTreeItem('MCP Servers', 'mcpGroup', plugin));
        }

        return children;
    }
}
