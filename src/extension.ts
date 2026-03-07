import * as vscode from 'vscode';
import { SkillBridgeTreeProvider, SkillTreeItem } from './treeView';
import { ImportService } from './importService';
import { UpdateWatcher } from './updateWatcher';
import { loadManifest, saveManifest, updateMarketplaceLastChecked } from './stateManager';
import { DiscoveryError } from './types';
import { installPluginInClaudeCache, fetchPluginJson } from './claudeInstaller';

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
                await vscode.commands.executeCommand('copilotSkillBridge.checkForUpdates');
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
                const typedValue = quickPick.value.trim();
                const isValidRepo = /^[\w.-]+\/[\w.-]+$/.test(typedValue);

                if (selected?.label === MANUAL_ENTRY_LABEL) {
                    repo = await vscode.window.showInputBox({
                        prompt: 'Enter GitHub repo (owner/name)',
                        placeHolder: 'owner/repo',
                        value: isValidRepo ? typedValue : undefined,
                        validateInput: (value) => {
                            return /^[\w.-]+\/[\w.-]+$/.test(value) ? null : 'Format: owner/repo-name';
                        },
                    });
                } else if (isValidRepo && (!selected || selected.label !== typedValue)) {
                    // User typed a valid owner/repo and pressed Enter — use it directly
                    repo = typedValue;
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
            'copilotSkillBridge.updateSkill',
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
            'copilotSkillBridge.importAllFromMarketplace',
            'copilotSkillBridge.removeAllFromMarketplace',
            'copilotSkillBridge.installInClaude',
            'copilotSkillBridge.installPluginInClaude',
            'copilotSkillBridge.installAllInClaude',
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
            remoteRepos: config.get<string[]>('marketplaces', []),
            checkInterval: config.get<number>('checkInterval', 86400),
            outputFormats: config.get<string[]>('outputFormats', ['prompts']),
            generateRegistry: config.get<boolean>('generateRegistry', true),
            useLmConversion: config.get<boolean>('useLmConversion', true),
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

    // Fast refresh: only reload manifest, reuse cached plugins
    async function refreshManifest() {
        const manifest = await loadManifest(workspaceUri);
        treeProvider.setData(importService.getPlugins(), manifest, importService.getDepGraph());
    }

    // Full refresh: re-discover plugins from local cache and remote repos
    async function refreshAll() {
        // Show loading spinner if we have data or configured marketplaces
        if (importService.getPlugins().length > 0 || getConfig().remoteRepos.length > 0) {
            treeProvider.setLoading();
        }
        const { cachePath, remoteRepos } = getConfig();
        let manifest = await loadManifest(workspaceUri);

        const { plugins, errors, dependencyGraph } = await importService.discoverAllPlugins(
            cachePath,
            remoteRepos,
            (partialPlugins, partialGraph) => {
                importService.setPlugins(partialPlugins);
                treeProvider.setData(partialPlugins, manifest, partialGraph);
            },
        );

        importService.setPlugins(plugins);
        treeProvider.setData(plugins, manifest, dependencyGraph);

        if (errors.length > 0) {
            // Don't block refresh — show errors asynchronously
            handleDiscoveryErrors(errors).catch(() => {});
        }
    }

    async function handleDiscoveryErrors(errors: DiscoveryError[]) {
        const authErrors = errors.filter(e => e.requiresAuth);
        const otherErrors = errors.filter(e => !e.requiresAuth);

        if (authErrors.length > 0) {
            const repos = authErrors.map(e => e.repo).join(', ');
            const choice = await vscode.window.showWarningMessage(
                `GitHub authentication required to fetch: ${repos}`,
                'Sign in to GitHub',
                'Dismiss'
            );
            if (choice === 'Sign in to GitHub') {
                const { loginToGitHub } = await import('./auth');
                const token = await loginToGitHub();
                if (token) {
                    await refreshAll();
                }
            }
        }

        for (const err of otherErrors) {
            vscode.window.showWarningMessage(
                `Failed to fetch marketplace "${err.repo}": ${err.message}`
            );
        }
    }

    // Don't block activation — refresh remotes in background, tree updates progressively
    refreshAll().catch(err => {
        console.error('[CopilotSkillBridge] Initial refresh failed:', err);
    });

    // Register workspace-dependent commands
    context.subscriptions.push(
        vscode.commands.registerCommand('copilotSkillBridge.importSkill', async (item?: SkillTreeItem) => {
            if (item?.skillInfo) {
                const { outputFormats, generateRegistry, useLmConversion } = getConfig();
                try {
                    await importService.importSkill(item.skillInfo, outputFormats, generateRegistry, useLmConversion);
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    vscode.window.showErrorMessage(`Import failed for "${item.skillInfo.name}": ${msg}`);
                }
                await refreshAll();
            } else {
                vscode.window.showWarningMessage('Select a skill from the Copilot Skill Bridge sidebar.');
            }
        }),

        vscode.commands.registerCommand('copilotSkillBridge.updateSkill', async (item?: SkillTreeItem) => {
            if (item?.skillInfo) {
                const { outputFormats, generateRegistry, useLmConversion } = getConfig();
                try {
                    await importService.updateSkill(item.skillInfo, outputFormats, generateRegistry, useLmConversion);
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    vscode.window.showErrorMessage(`Update failed for "${item.skillInfo.name}": ${msg}`);
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
            const { outputFormats, generateRegistry, useLmConversion } = getConfig();
            try {
                await importService.importAllSkills(
                    plugin.skills,
                    outputFormats,
                    generateRegistry,
                    plugin.mcpServers,
                    useLmConversion
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

        vscode.commands.registerCommand('copilotSkillBridge.removeMarketplace', async (item?: SkillTreeItem) => {
            const repo = item?.marketplaceRepo ?? item?.pluginInfo?.marketplace;
            if (!repo) {
                vscode.window.showWarningMessage('Select a marketplace or plugin from the Copilot Skill Bridge sidebar.');
                return;
            }

            const choice = await vscode.window.showWarningMessage(
                `Remove marketplace "${repo}" and all its imported skills?`,
                { modal: true },
                'Remove'
            );
            if (choice !== 'Remove') { return; }

            // Remove all imported skills/MCP servers from this marketplace and its deps
            const plugins = importService.getPluginsByMarketplaceTransitive(repo);
            const allSkills = plugins.flatMap(p => p.skills);
            const allMcpServers = plugins.flatMap(p => p.mcpServers ?? []);
            const { generateRegistry, outputFormats } = getConfig();
            try {
                await importService.removeAllSkills(allSkills, generateRegistry, allMcpServers, outputFormats as import('./types').OutputFormat[]);
            } catch {
                // Best effort — continue removing marketplace from settings
            }

            // Remove from settings
            const config = vscode.workspace.getConfiguration('copilotSkillBridge');
            const current: string[] = config.get('marketplaces', []);
            const updated = current.filter(r => r !== repo);
            await config.update('marketplaces', updated, vscode.ConfigurationTarget.Global);

            vscode.window.showInformationMessage(`Removed marketplace: ${repo}`);

            // Update sidebar immediately without full remote re-fetch
            const remaining = importService.getPlugins().filter(p => p.marketplace !== repo);
            importService.setPlugins(remaining);
            const updatedManifest = await loadManifest(workspaceUri);
            treeProvider.setData(remaining, updatedManifest, importService.getDepGraph());
        }),

        vscode.commands.registerCommand('copilotSkillBridge.importAllFromMarketplace', async (item?: SkillTreeItem) => {
            const repo = item?.marketplaceRepo;
            if (!repo) {
                vscode.window.showWarningMessage('Select a marketplace from the Copilot Skill Bridge sidebar.');
                return;
            }
            // Use direct plugins — importAllSkills auto-resolves referenced
            // cross-plugin deps (e.g. superpowers:brainstorming).
            // For redirect-only repos (0 direct plugins), fall back to transitive.
            const directPlugins = importService.getPluginsByMarketplace(repo);
            const plugins = directPlugins.length > 0
                ? directPlugins
                : importService.getPluginsByMarketplaceTransitive(repo);
            const allSkills = plugins.flatMap(p => p.skills);
            const allMcpServers = plugins.flatMap(p => p.mcpServers ?? []);
            const { outputFormats, generateRegistry, useLmConversion } = getConfig();
            try {
                await importService.importAllSkills(allSkills, outputFormats, generateRegistry, allMcpServers, useLmConversion);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`Import All failed: ${msg}`);
            }
            await refreshAll();
        }),

        vscode.commands.registerCommand('copilotSkillBridge.removeAllFromMarketplace', async (item?: SkillTreeItem) => {
            const repo = item?.marketplaceRepo;
            if (!repo) {
                vscode.window.showWarningMessage('Select a marketplace from the Copilot Skill Bridge sidebar.');
                return;
            }
            // Always use transitive — remove should clean up all dep skills too
            const plugins = importService.getPluginsByMarketplaceTransitive(repo);
            const allSkills = plugins.flatMap(p => p.skills);
            const allMcpServers = plugins.flatMap(p => p.mcpServers ?? []);
            const { generateRegistry, outputFormats } = getConfig();
            try {
                await importService.removeAllSkills(allSkills, generateRegistry, allMcpServers, outputFormats as import('./types').OutputFormat[]);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`Remove All failed: ${msg}`);
            }

            // Update sidebar immediately without full remote re-fetch
            const updatedManifest = await loadManifest(workspaceUri);
            treeProvider.setData(importService.getPlugins(), updatedManifest, importService.getDepGraph());
        }),

        vscode.commands.registerCommand('copilotSkillBridge.installInClaude', async (item?: SkillTreeItem) => {
            const skill = item?.skillInfo;
            if (!skill) {
                vscode.window.showWarningMessage('Select a skill from the Copilot Skill Bridge sidebar.');
                return;
            }
            const plugin = importService.getPlugins().find(
                p => p.name === skill.pluginName && p.marketplace === skill.marketplace
            );
            if (!plugin) {
                vscode.window.showErrorMessage(`Could not find parent plugin for skill "${skill.name}".`);
                return;
            }
            const { cachePath } = getConfig();
            try {
                const pluginJson = await fetchPluginJson(plugin);
                await installPluginInClaudeCache(plugin, cachePath, pluginJson);
                vscode.window.showInformationMessage(`Installed "${plugin.name}" in Claude Code.`);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`Install in Claude Code failed for "${plugin.name}": ${msg}`);
            }
        }),

        vscode.commands.registerCommand('copilotSkillBridge.installPluginInClaude', async (item?: SkillTreeItem) => {
            const plugin = item?.pluginInfo;
            if (!plugin) {
                vscode.window.showWarningMessage('Select a plugin from the Copilot Skill Bridge sidebar.');
                return;
            }
            const { cachePath } = getConfig();
            try {
                const pluginJson = await fetchPluginJson(plugin);
                await installPluginInClaudeCache(plugin, cachePath, pluginJson);
                vscode.window.showInformationMessage(`Installed "${plugin.name}" in Claude Code.`);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`Install in Claude Code failed for "${plugin.name}": ${msg}`);
            }
        }),

        vscode.commands.registerCommand('copilotSkillBridge.installAllInClaude', async (item?: SkillTreeItem) => {
            const repo = item?.marketplaceRepo;
            if (!repo) {
                vscode.window.showWarningMessage('Select a marketplace from the Copilot Skill Bridge sidebar.');
                return;
            }
            const directPlugins = importService.getPluginsByMarketplace(repo);
            const plugins = directPlugins.length > 0
                ? directPlugins
                : importService.getPluginsByMarketplaceTransitive(repo);

            if (plugins.length === 0) {
                vscode.window.showWarningMessage(`No plugins found for marketplace "${repo}".`);
                return;
            }

            const choice = await vscode.window.showWarningMessage(
                `Install ${plugins.length} plugin(s) from "${repo}" into Claude Code?`,
                { modal: true },
                'Install'
            );
            if (choice !== 'Install') { return; }

            const { cachePath } = getConfig();
            let installed = 0;
            let failed = 0;

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Installing plugins from "${repo}" into Claude Code`,
                    cancellable: true,
                },
                async (progress, token) => {
                    for (let i = 0; i < plugins.length; i++) {
                        if (token.isCancellationRequested) { break; }
                        const plugin = plugins[i];
                        progress.report({
                            message: `${i + 1}/${plugins.length}: ${plugin.name}`,
                            increment: (1 / plugins.length) * 100,
                        });
                        try {
                            const pluginJson = await fetchPluginJson(plugin);
                            await installPluginInClaudeCache(plugin, cachePath, pluginJson);
                            installed++;
                        } catch (err) {
                            failed++;
                            const msg = err instanceof Error ? err.message : String(err);
                            console.error(`[CopilotSkillBridge] Failed to install "${plugin.name}" in Claude Code: ${msg}`);
                        }
                    }
                }
            );

            if (failed === 0) {
                vscode.window.showInformationMessage(
                    `Installed ${installed} plugin(s) from "${repo}" in Claude Code.`
                );
            } else {
                vscode.window.showWarningMessage(
                    `Installed ${installed} plugin(s), ${failed} failed from "${repo}" in Claude Code.`
                );
            }
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

    updateWatcher.onRemoteChange(async ({ repo, newSha }) => {
        // Update lastChecked SHA so we don't re-notify for the same commit
        if (workspaceFolder) {
            try {
                let manifest = await loadManifest(workspaceFolder.uri);
                manifest = updateMarketplaceLastChecked(manifest, repo, newSha);
                await saveManifest(workspaceFolder.uri, manifest);
            } catch { /* non-critical */ }
        }

        const choice = await vscode.window.showInformationMessage(
            `Marketplace "${repo}" has updates. Refresh skills?`,
            'Review', 'Skip'
        );
        if (choice === 'Review') {
            await refreshAll();
        }
    });

    context.subscriptions.push(updateWatcher);

    // Watch manifest file for changes (e.g. branch switch)
    const manifestWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(workspaceUri, '.github/.copilot-skill-bridge.json')
    );
    manifestWatcher.onDidChange(() => refreshManifest());
    manifestWatcher.onDidCreate(() => refreshManifest());
    manifestWatcher.onDidDelete(() => refreshManifest());
    context.subscriptions.push(manifestWatcher);

    // Watch .git/HEAD for branch switches
    const gitHeadWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(workspaceUri, '.git/HEAD')
    );
    gitHeadWatcher.onDidChange(() => refreshManifest());
    context.subscriptions.push(gitHeadWatcher);

    // Listen for config changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('copilotSkillBridge')) {
                refreshAll().catch(() => { /* errors handled inside refreshAll */ });
            }
        })
    );
}

export function deactivate() {
    updateWatcher?.dispose();
}
