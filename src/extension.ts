import * as vscode from 'vscode';
import { SkillBridgeTreeProvider, SkillTreeItem } from './treeView';
import { ImportService } from './importService';
import { UpdateWatcher } from './updateWatcher';
import { loadManifest } from './stateManager';
import { generateRegistryEntry } from './converter';
import { updateCopilotInstructions } from './fileWriter';

let updateWatcher: UpdateWatcher | undefined;

export async function activate(context: vscode.ExtensionContext) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return;
    }

    const config = vscode.workspace.getConfiguration('copilotSkillBridge');
    const cachePath = config.get<string>('claudeCachePath', '~/.claude/plugins/cache');
    const remoteRepos = config.get<string[]>('marketplaces', ['obra/superpowers']);
    const checkInterval = config.get<number>('checkInterval', 86400);
    const outputFormats = config.get<string[]>('outputFormats', ['instructions', 'prompts']);
    const generateRegistry = config.get<boolean>('generateRegistry', true);

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
        const plugins = await importService.discoverAllPlugins(cachePath, remoteRepos);
        importService.setPlugins(plugins);
        const manifest = await loadManifest(workspaceUri);
        treeProvider.setData(plugins, manifest);
    }

    await refreshAll();

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('copilotSkillBridge.importSkill', async (item?: SkillTreeItem) => {
            if (item?.skillInfo) {
                await importService.importSkill(item.skillInfo, outputFormats, generateRegistry);
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
            for (const skill of plugin.skills) {
                await importService.importSkill(skill, outputFormats, generateRegistry);
            }
            await refreshAll();
        }),

        vscode.commands.registerCommand('copilotSkillBridge.checkForUpdates', async () => {
            await refreshAll();
            vscode.window.showInformationMessage('Skill Bridge: Update check complete.');
        }),

        vscode.commands.registerCommand('copilotSkillBridge.addMarketplace', async () => {
            const repo = await vscode.window.showInputBox({
                prompt: 'Enter GitHub repo (owner/name)',
                placeHolder: 'obra/superpowers',
                validateInput: (value) => {
                    return /^[\w.-]+\/[\w.-]+$/.test(value) ? null : 'Format: owner/repo-name';
                },
            });
            if (repo) {
                const current = config.get<string[]>('marketplaces', []);
                if (!current.includes(repo)) {
                    await config.update('marketplaces', [...current, repo], vscode.ConfigurationTarget.Global);
                    await refreshAll();
                    vscode.window.showInformationMessage(`Added marketplace: ${repo}`);
                }
            }
        }),

        vscode.commands.registerCommand('copilotSkillBridge.removeSkill', async (item?: SkillTreeItem) => {
            if (item?.skillInfo) {
                await importService.removeSkill(item.skillInfo.name, generateRegistry);
                await refreshAll();
            }
        }),

        vscode.commands.registerCommand('copilotSkillBridge.rebuildRegistry', async () => {
            const manifest = await loadManifest(workspaceUri);
            const entries = Object.keys(manifest.skills).map(name => {
                return generateRegistryEntry(name, '');
            });
            await updateCopilotInstructions(workspaceUri, entries);
            vscode.window.showInformationMessage('Skill registry rebuilt.');
        }),
    );

    // Start update watcher
    updateWatcher = new UpdateWatcher(cachePath);
    updateWatcher.startLocalWatcher();
    updateWatcher.startRemoteChecker(remoteRepos, checkInterval, await loadManifest(workspaceUri));

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
