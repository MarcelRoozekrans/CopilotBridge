import * as vscode from 'vscode';
import { SkillInfo, PluginInfo, SkillStatus, McpServerInfo, DependencyGraph } from './types';
import { BridgeManifest } from './types';
import { computeHash, isSkillImported, isSkillOutdated } from './stateManager';
import { analyzeCompatibility } from './compatAnalyzer';

export type TreeItemType = 'marketplace' | 'plugin' | 'skill' | 'mcpGroup' | 'mcpServer' | 'dependencyGroup';

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
            this.contextValue = pluginInfo?.source === 'local' ? 'plugin-local' : 'plugin';
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
        } else if (itemType === 'dependencyGroup') {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            this.iconPath = new vscode.ThemeIcon('library');
            this.contextValue = 'dependencyGroup';
            this.tooltip = 'Dependency repositories';
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
    private _loading = false;
    private depGraph: DependencyGraph = { edges: new Map(), roots: [] };

    setData(plugins: PluginInfo[], manifest: BridgeManifest, depGraph?: DependencyGraph) {
        this.plugins = plugins;
        this.manifest = manifest;
        this.depGraph = depGraph ?? { edges: new Map(), roots: [] };
        this._loading = false;
        this._onDidChangeTreeData.fire();
    }

    setLoading() {
        this._loading = true;
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
            if (this._loading && this.plugins.length === 0) {
                const item = new vscode.TreeItem('Refreshing skills...', vscode.TreeItemCollapsibleState.None);
                item.iconPath = new vscode.ThemeIcon('sync~spin');
                return [item as unknown as SkillTreeItem];
            }
            const roots = this.getRootNodes();
            if (this._loading) {
                const loadingItem = new vscode.TreeItem('Fetching remote skills...', vscode.TreeItemCollapsibleState.None);
                loadingItem.iconPath = new vscode.ThemeIcon('sync~spin');
                roots.push(loadingItem as unknown as SkillTreeItem);
            }
            return roots;
        }

        if (element.itemType === 'marketplace') {
            const repo = element.marketplaceRepo!;
            const children = this.plugins
                .filter(p => p.marketplace === repo)
                .map(p => new SkillTreeItem(p.name, 'plugin', p));

            const depRepos = this.depGraph.edges.get(repo) ?? [];
            if (depRepos.length > 0) {
                const depNode = new SkillTreeItem('Dependencies', 'dependencyGroup', undefined, undefined, undefined, undefined, undefined, repo);
                depNode.description = `${depRepos.length} repo${depRepos.length > 1 ? 's' : ''}`;
                children.push(depNode);
            }

            return children;
        }

        if (element.itemType === 'dependencyGroup') {
            const repo = element.marketplaceRepo!;
            const depRepos = this.depGraph.edges.get(repo) ?? [];
            return this.getDependencyChildren(depRepos);
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

        // Collect all repos that appear as dependency targets
        const depTargets = new Set<string>();
        if (this.depGraph.roots.length > 0) {
            for (const deps of this.depGraph.edges.values()) {
                for (const dep of deps) {
                    depTargets.add(dep);
                }
            }
        }

        const items: SkillTreeItem[] = [];
        for (const [repo, plugins] of byMarketplace) {
            // Hide dependency repos from root level
            if (depTargets.has(repo)) { continue; }

            const hasDeps = (this.depGraph.edges.get(repo)?.length ?? 0) > 0;

            if (plugins.length === 1 && !hasDeps) {
                items.push(new SkillTreeItem(plugins[0].name, 'plugin', plugins[0]));
            } else {
                // Promote single-plugin roots with deps to marketplace node so deps can be children
                const node = new SkillTreeItem(repo, 'marketplace', undefined, undefined, undefined, undefined, undefined, repo);
                node.description = `${plugins.length} plugin${plugins.length > 1 ? 's' : ''}`;
                const allLocal = plugins.every(p => p.source === 'local');
                if (allLocal) { node.contextValue = 'marketplace-local'; }
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
            } else {
                // Show cross-skill dependencies in description
                const crossDeps = compat.skillDependencies.filter(d => d !== skill.name);
                if (crossDeps.length > 0) {
                    item.description = `${item.description} \u2192 ${crossDeps.join(', ')}`;
                }
            }

            children.push(item);
        }

        const mcpServers = plugin.mcpServers ?? [];
        if (mcpServers.length > 0) {
            children.push(new SkillTreeItem('MCP Servers', 'mcpGroup', plugin));
        }

        return children;
    }

    private getDependencyChildren(depRepos: string[]): SkillTreeItem[] {
        const items: SkillTreeItem[] = [];
        for (const depRepo of depRepos) {
            const plugins = this.plugins.filter(p => p.marketplace === depRepo);
            if (plugins.length === 0) {
                // All redirects or failed fetches — skip
                continue;
            } else if (plugins.length === 1) {
                items.push(new SkillTreeItem(plugins[0].name, 'plugin', plugins[0]));
            } else {
                const node = new SkillTreeItem(depRepo, 'marketplace', undefined, undefined, undefined, undefined, undefined, depRepo);
                node.description = `${plugins.length} plugin${plugins.length > 1 ? 's' : ''}`;
                items.push(node);
            }
        }
        return items;
    }
}
