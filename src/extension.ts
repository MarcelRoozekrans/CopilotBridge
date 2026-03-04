import * as vscode from 'vscode';
import { SkillBridgeTreeProvider, SkillTreeItem } from './treeView';
import { ImportService } from './importService';
import { UpdateWatcher } from './updateWatcher';
import { loadManifest } from './stateManager';

let updateWatcher: UpdateWatcher | undefined;

const skillContentScheme = 'skill-bridge';
const skillContentStore = new Map<string, string>();

class SkillContentProvider implements vscode.TextDocumentContentProvider {
    provideTextDocumentContent(uri: vscode.Uri): string {
        // Strip .md extension added for language detection
        const key = uri.path.replace(/\.md$/, '');
        return skillContentStore.get(key) ?? '';
    }
}

export async function activate(context: vscode.ExtensionContext) {
    const noWorkspace = 'Open a folder to use Copilot Skill Bridge.';

    // Register virtual document provider for skill previews
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(skillContentScheme, new SkillContentProvider()),
    );

    // Commands that work without a workspace
    context.subscriptions.push(
        vscode.commands.registerCommand('copilotSkillBridge.showSkillContent', async (item?: SkillTreeItem) => {
            if (!item?.skillInfo) { return; }
            const key = `/${item.skillInfo.pluginName}/${item.skillInfo.name}`;
            skillContentStore.set(key, item.skillInfo.content);
            const uri = vscode.Uri.parse(`${skillContentScheme}:${key}.md`);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: false });
        }),

        vscode.commands.registerCommand('copilotSkillBridge.openSourceRepo', async (item?: SkillTreeItem) => {
            const repo = item?.marketplaceRepo ?? item?.pluginInfo?.marketplace;
            if (repo && /^[\w.-]+\/[\w.-]+$/.test(repo)) {
                await vscode.env.openExternal(vscode.Uri.parse(`https://github.com/${repo}`));
            }
        }),
        vscode.commands.registerCommand('copilotSkillBridge.login', async () => {
            const { loginToGitHub } = await import('./auth');
            const token = await loginToGitHub();
            if (token) {
                vscode.window.showInformationMessage('Signed in to GitHub successfully.');
            } else {
                vscode.window.showWarningMessage('GitHub sign-in was cancelled or failed.');
            }
        }),

        vscode.commands.registerCommand('copilotSkillBridge.addMarketplace', async () => {
            const { searchMarketplaces } = await import('./marketplaceSearch');

            const quickPick = vscode.window.createQuickPick();
            quickPick.placeholder = 'Search GitHub for Claude marketplaces...';
            quickPick.matchOnDescription = true;
            quickPick.busy = true;

            const MANUAL_ENTRY_LABEL = '$(edit) Enter manually...';

            function makeItems(results: import('./types').MarketplaceSearchResult[]): vscode.QuickPickItem[] {
                const items: vscode.QuickPickItem[] = results.map(r => ({
                    label: r.repo,
                    description: r.stars > 0 ? `$(star) ${r.stars}` : '',
                    detail: r.description,
                }));
                items.push({ label: MANUAL_ENTRY_LABEL, description: '', detail: 'Type an owner/repo path directly', alwaysShow: true });
                return items;
            }

            // Initial load
            try {
                const results = await searchMarketplaces();
                quickPick.items = makeItems(results);
            } catch {
                quickPick.items = [{ label: MANUAL_ENTRY_LABEL, description: '', detail: 'Search unavailable — enter manually', alwaysShow: true }];
            }
            quickPick.busy = false;

            // Debounced search on input
            let debounceTimer: ReturnType<typeof setTimeout> | undefined;
            const disposables: vscode.Disposable[] = [];

            disposables.push(quickPick.onDidChangeValue(value => {
                if (debounceTimer) { clearTimeout(debounceTimer); }
                debounceTimer = setTimeout(async () => {
                    quickPick.busy = true;
                    try {
                        const results = await searchMarketplaces(value || undefined);
                        quickPick.items = makeItems(results);
                    } catch {
                        // Keep existing items on error
                    }
                    quickPick.busy = false;
                }, 400);
            }));

            disposables.push(quickPick.onDidAccept(async () => {
                const selected = quickPick.selectedItems[0];
                if (debounceTimer) { clearTimeout(debounceTimer); }

                let repo: string | undefined;

                if (selected?.label === MANUAL_ENTRY_LABEL) {
                    repo = await vscode.window.showInputBox({
                        prompt: 'Enter GitHub repo (owner/name)',
                        placeHolder: 'obra/superpowers',
                        validateInput: (value) => {
                            return /^[\w.-]+\/[\w.-]+$/.test(value) ? null : 'Format: owner/repo-name';
                        },
                    });
                } else if (selected) {
                    repo = selected.label;
                }

                if (repo) {
                    const config = vscode.workspace.getConfiguration('copilotSkillBridge');
                    const current = config.get<string[]>('marketplaces', []);
                    if (current.includes(repo)) {
                        vscode.window.showInformationMessage(`Marketplace already added: ${repo}`);
                    } else {
                        await config.update('marketplaces', [...current, repo], vscode.ConfigurationTarget.Global);
                        vscode.window.showInformationMessage(`Added marketplace: ${repo}`);
                    }
                }

                quickPick.hide();
            }));

            disposables.push(quickPick.onDidHide(() => {
                if (debounceTimer) { clearTimeout(debounceTimer); }
                disposables.forEach(d => d.dispose());
                quickPick.dispose();
            }));

            quickPick.show();
        }),
    );

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        // Register remaining commands as no-ops that show a helpful message
        const workspaceCommands = [
            'copilotSkillBridge.importSkill',
            'copilotSkillBridge.importAllSkills',
            'copilotSkillBridge.checkForUpdates',
            'copilotSkillBridge.removeSkill',
            'copilotSkillBridge.rebuildRegistry',
            'copilotSkillBridge.importMcpServer',
            'copilotSkillBridge.importAllMcpServers',
            'copilotSkillBridge.removeMcpServer',
            'copilotSkillBridge.embedSkill',
            'copilotSkillBridge.unembedSkill',
            'copilotSkillBridge.removeAllSkills',
            'copilotSkillBridge.removeAllFromMarketplace',
        ];
        for (const cmd of workspaceCommands) {
            context.subscriptions.push(
                vscode.commands.registerCommand(cmd, () => {
                    vscode.window.showWarningMessage(noWorkspace);
                })
            );
        }
        return;
    }

    function getConfig() {
        const config = vscode.workspace.getConfiguration('copilotSkillBridge');
        return {
            cachePath: config.get<string>('claudeCachePath', '~/.claude/plugins/cache'),
            remoteRepos: config.get<string[]>('marketplaces', ['obra/superpowers']),
            checkInterval: config.get<number>('checkInterval', 86400),
            outputFormats: config.get<string[]>('outputFormats', ['prompts']),
            generateRegistry: config.get<boolean>('generateRegistry', true),
        };
    }

    const workspaceUri = workspaceFolder.uri;
    const importService = new ImportService(workspaceUri);
    const treeProvider = new SkillBridgeTreeProvider();

    // Register TreeView
    const treeView = vscode.window.createTreeView('skillBridgeExplorer', {
        treeDataProvider: treeProvider,
        showCollapseAll: true,
    });
    context.subscriptions.push(treeView);

    // Initial discovery
    async function refreshAll() {
        const { cachePath, remoteRepos } = getConfig();
        const plugins = await importService.discoverAllPlugins(cachePath, remoteRepos);
        importService.setPlugins(plugins);
        const manifest = await loadManifest(workspaceUri);
        treeProvider.setData(plugins, manifest);
    }

    await refreshAll();

    // Register workspace-dependent commands
    context.subscriptions.push(
        vscode.commands.registerCommand('copilotSkillBridge.importSkill', async (item?: SkillTreeItem) => {
            if (item?.skillInfo) {
                const { outputFormats, generateRegistry } = getConfig();
                try {
                    await importService.importSkill(item.skillInfo, outputFormats, generateRegistry);
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    vscode.window.showErrorMessage(`Import failed for "${item.skillInfo.name}": ${msg}`);
                }
                await refreshAll();
            } else {
                vscode.window.showWarningMessage('Select a skill from the Copilot Skill Bridge sidebar.');
            }
        }),

        vscode.commands.registerCommand('copilotSkillBridge.importAllSkills', async (item?: SkillTreeItem) => {
            const plugin = item?.pluginInfo;
            if (!plugin) {
                vscode.window.showWarningMessage('Select a plugin from the Copilot Skill Bridge sidebar.');
                return;
            }
            const { outputFormats, generateRegistry } = getConfig();
            try {
                await importService.importAllSkills(
                    plugin.skills,
                    outputFormats,
                    generateRegistry,
                    plugin.mcpServers
                );
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`Import All failed: ${msg}`);
            }
            await refreshAll();
        }),

        vscode.commands.registerCommand('copilotSkillBridge.checkForUpdates', async () => {
            await refreshAll();
            vscode.window.showInformationMessage('Skill Bridge: Update check complete.');
        }),

        vscode.commands.registerCommand('copilotSkillBridge.removeSkill', async (item?: SkillTreeItem) => {
            if (item?.skillInfo) {
                const { generateRegistry, outputFormats } = getConfig();
                try {
                    await importService.removeSkill(item.skillInfo.name, generateRegistry, outputFormats as import('./types').OutputFormat[]);
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    vscode.window.showErrorMessage(`Remove failed for "${item.skillInfo.name}": ${msg}`);
                }
                await refreshAll();
            }
        }),

        vscode.commands.registerCommand('copilotSkillBridge.rebuildRegistry', async () => {
            try {
                const { outputFormats } = getConfig();
                await importService.rebuildRegistry(outputFormats as import('./types').OutputFormat[]);
                vscode.window.showInformationMessage('Skill registry rebuilt.');
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`Rebuild registry failed: ${msg}`);
            }
        }),

        vscode.commands.registerCommand('copilotSkillBridge.embedSkill', async (item?: SkillTreeItem) => {
            if (item?.skillInfo) {
                try {
                    await importService.embedSkill(item.skillInfo.name);
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    vscode.window.showErrorMessage(`Embed failed for "${item.skillInfo.name}": ${msg}`);
                }
                await refreshAll();
            }
        }),

        vscode.commands.registerCommand('copilotSkillBridge.unembedSkill', async (item?: SkillTreeItem) => {
            if (item?.skillInfo) {
                try {
                    await importService.unembedSkill(item.skillInfo.name);
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    vscode.window.showErrorMessage(`Unembed failed for "${item.skillInfo.name}": ${msg}`);
                }
                await refreshAll();
            }
        }),

        vscode.commands.registerCommand('copilotSkillBridge.importMcpServer', async (item?: SkillTreeItem) => {
            if (item?.mcpServerInfo) {
                try {
                    await importService.importMcpServer(item.mcpServerInfo);
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    vscode.window.showErrorMessage(`Import MCP server failed: ${msg}`);
                }
                await refreshAll();
            } else {
                vscode.window.showWarningMessage('Select an MCP server from the Copilot Skill Bridge sidebar.');
            }
        }),

        vscode.commands.registerCommand('copilotSkillBridge.importAllMcpServers', async (item?: SkillTreeItem) => {
            const plugin = item?.pluginInfo;
            if (!plugin?.mcpServers?.length) {
                vscode.window.showWarningMessage('No MCP servers found for this plugin.');
                return;
            }
            try {
                await importService.importAllMcpServers(plugin.mcpServers);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`Import MCP servers failed: ${msg}`);
            }
            await refreshAll();
        }),

        vscode.commands.registerCommand('copilotSkillBridge.removeMcpServer', async (item?: SkillTreeItem) => {
            if (item?.mcpServerInfo) {
                try {
                    await importService.removeMcpServer(item.mcpServerInfo.name);
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    vscode.window.showErrorMessage(`Remove MCP server failed: ${msg}`);
                }
                await refreshAll();
            }
        }),

        vscode.commands.registerCommand('copilotSkillBridge.removeAllSkills', async (item?: SkillTreeItem) => {
            const plugin = item?.pluginInfo;
            if (!plugin) {
                vscode.window.showWarningMessage('Select a plugin from the Copilot Skill Bridge sidebar.');
                return;
            }
            const { generateRegistry, outputFormats } = getConfig();
            try {
                await importService.removeAllSkills(plugin.skills, generateRegistry, plugin.mcpServers, outputFormats as import('./types').OutputFormat[]);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`Remove All failed: ${msg}`);
            }
            await refreshAll();
        }),

        vscode.commands.registerCommand('copilotSkillBridge.removeAllFromMarketplace', async (item?: SkillTreeItem) => {
            const repo = item?.marketplaceRepo;
            if (!repo) {
                vscode.window.showWarningMessage('Select a marketplace from the Copilot Skill Bridge sidebar.');
                return;
            }
            const plugins = importService.getPluginsByMarketplace(repo);
            const allSkills = plugins.flatMap(p => p.skills);
            const allMcpServers = plugins.flatMap(p => p.mcpServers ?? []);
            const { generateRegistry, outputFormats } = getConfig();
            try {
                await importService.removeAllSkills(allSkills, generateRegistry, allMcpServers, outputFormats as import('./types').OutputFormat[]);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`Remove All failed: ${msg}`);
            }
            await refreshAll();
        }),
    );

    // Start update watcher
    const initialConfig = getConfig();
    updateWatcher = new UpdateWatcher(initialConfig.cachePath);
    updateWatcher.startLocalWatcher();
    updateWatcher.startRemoteChecker(initialConfig.remoteRepos, initialConfig.checkInterval, await loadManifest(workspaceUri));

    updateWatcher.onLocalChange(async (filePath) => {
        const choice = await vscode.window.showInformationMessage(
            `Skill source changed: ${filePath}. Refresh and check for updates?`,
            'Review', 'Skip'
        );
        if (choice === 'Review') {
            await refreshAll();
        }
    });

    updateWatcher.onRemoteChange(async ({ repo }) => {
        const choice = await vscode.window.showInformationMessage(
            `Marketplace "${repo}" has updates. Refresh skills?`,
            'Review', 'Skip'
        );
        if (choice === 'Review') {
            await refreshAll();
        }
    });

    context.subscriptions.push(updateWatcher);

    // Listen for config changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('copilotSkillBridge')) {
                refreshAll();
            }
        })
    );
}

export function deactivate() {
    updateWatcher?.dispose();
}
