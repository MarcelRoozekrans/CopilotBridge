import * as vscode from 'vscode';
import { SkillInfo, PluginInfo, ConversionResult, McpServerInfo, BulkImportResult, DiscoveryResult, DiscoveryError, DependencyGraph } from './types';
import { convertSkillContent, generateInstructionsFile, generatePromptFile, generateFullPromptFile, generateRegistryEntry, OutputFormat } from './converter';
import { parseSkillFrontmatter } from './parser';
import { computeHash, loadManifest, saveManifest, recordImport, removeSkillRecord, recordMcpImport, removeMcpRecord, isMcpServerImported, setSkillEmbedded, isSkillImported } from './stateManager';
import { writeInstructionsFile, writePromptFile, updateCopilotInstructions, removeSkillFiles, writeCompanionFiles } from './fileWriter';
import { discoverLocalPlugins } from './localReader';
import { discoverRemotePlugins, GitHubApiError, RemoteDiscoveryResult, resetTokenCache } from './remoteReader';
import { convertMcpServers } from './mcpConverter';
import { readMcpJson, writeMcpJson, mergeMcpConfigs, removeServerFromConfig } from './mcpWriter';
import { analyzeCompatibility, extractSkillDependencies } from './compatAnalyzer';
import { convertWithLM } from './lmConverter';

let outputChannel: vscode.OutputChannel | undefined;
function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('Copilot Skill Bridge');
    }
    return outputChannel;
}
function log(msg: string): void {
    getOutputChannel().appendLine(`[${new Date().toISOString()}] ${msg}`);
}

const META_ORCHESTRATOR_PATTERNS: RegExp[] = [
    /check\s+skills?\s+before\s+every\s+response/i,
    /invoke.*skill.*before.*any.*response/i,
];

function isMetaOrchestratorSkill(skill: SkillInfo): boolean {
    return META_ORCHESTRATOR_PATTERNS.some(p => p.test(skill.content));
}

export class ImportService {
    private allPlugins: PluginInfo[] = [];
    private _depGraph: DependencyGraph = { edges: new Map(), roots: [] };

    constructor(private workspaceUri: vscode.Uri) {}

    getDepGraph(): DependencyGraph {
        return this._depGraph;
    }

    async discoverAllPlugins(
        cachePath: string,
        remoteRepos: string[],
        onProgress?: (plugins: PluginInfo[], depGraph?: DependencyGraph) => void,
        remoteFetcher: (repo: string) => Promise<RemoteDiscoveryResult> = discoverRemotePlugins,
    ): Promise<DiscoveryResult> {
        resetTokenCache();
        const localPlugins = await discoverLocalPlugins(cachePath);
        const remotePlugins: PluginInfo[] = [];
        const errors: DiscoveryError[] = [];
        const depGraph: DependencyGraph = { edges: new Map(), roots: [...remoteRepos] };

        // Show local plugins immediately
        if (onProgress && localPlugins.length > 0) {
            onProgress(this.mergePluginLists(localPlugins, []), depGraph);
        }

        const visited = new Set<string>();
        const queue = [...remoteRepos];
        log(`BFS start: queue=${JSON.stringify(remoteRepos)}`);

        while (queue.length > 0) {
            const batch = queue.splice(0, queue.length).filter(repo => {
                const key = repo.toLowerCase();
                if (visited.has(key)) { return false; }
                visited.add(key);
                return true;
            });

            if (batch.length === 0) { break; }
            log(`BFS batch: ${JSON.stringify(batch)}`);

            const results = await Promise.allSettled(
                batch.map(repo => remoteFetcher(repo))
            );

            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                if (result.status === 'fulfilled') {
                    const pluginNames = result.value.plugins.map(p => p.name);
                    log(`  ${batch[i]}: ${pluginNames.length} plugins [${pluginNames.join(', ')}], ${result.value.dependencies.length} deps [${result.value.dependencies.join(', ')}]`);
                    remotePlugins.push(...result.value.plugins);
                    for (const dep of result.value.dependencies) {
                        const parentEdges = depGraph.edges.get(batch[i]) ?? [];
                        parentEdges.push(dep);
                        depGraph.edges.set(batch[i], parentEdges);

                        if (!visited.has(dep.toLowerCase())) {
                            queue.push(dep);
                        }
                    }
                } else {
                    const err = result.reason;
                    log(`  ${batch[i]}: ERROR ${err instanceof Error ? err.message : String(err)}`);
                    errors.push({
                        repo: batch[i],
                        message: err instanceof Error ? err.message : String(err),
                        requiresAuth: err instanceof GitHubApiError && err.requiresAuth,
                    });
                }
            }

            log(`BFS queue after batch: ${JSON.stringify(queue)}`);

            // Show incremental results after each BFS batch
            if (onProgress) {
                onProgress(this.mergePluginLists(localPlugins, remotePlugins), depGraph);
            }
        }
        log(`BFS complete: ${remotePlugins.length} total remote plugins, ${errors.length} errors`);

        this._depGraph = depGraph;

        return {
            plugins: this.mergePluginLists(localPlugins, remotePlugins),
            errors,
            dependencyGraph: depGraph,
        };
    }

    mergePluginLists(localPlugins: PluginInfo[], remotePlugins: PluginInfo[]): PluginInfo[] {
        const merged = new Map<string, PluginInfo>();

        for (const p of localPlugins) {
            merged.set(p.name, p);
        }

        for (const p of remotePlugins) {
            const existing = merged.get(p.name);
            if (existing) {
                existing.source = 'both';
                // Merge skills
                const existingNames = new Set(existing.skills.map(s => s.name));
                for (const skill of p.skills) {
                    if (!existingNames.has(skill.name)) {
                        existing.skills.push(skill);
                    }
                }
                // Merge MCP servers
                if (p.mcpServers?.length) {
                    const existingMcpNames = new Set((existing.mcpServers ?? []).map(s => s.name));
                    const mergedMcp = [...(existing.mcpServers ?? [])];
                    for (const server of p.mcpServers) {
                        if (!existingMcpNames.has(server.name)) {
                            mergedMcp.push(server);
                        }
                    }
                    existing.mcpServers = mergedMcp;
                }
            } else {
                merged.set(p.name, p);
            }
        }

        return Array.from(merged.values());
    }

    async convertSkill(skill: SkillInfo, outputFormats?: OutputFormat[], useLm?: boolean): Promise<ConversionResult> {
        const parsed = parseSkillFrontmatter(skill.content);
        let convertedBody = convertSkillContent(parsed.body, outputFormats);

        if (useLm) {
            convertedBody = await convertWithLM(convertedBody);
        }

        if (skill.companionFiles?.length) {
            for (const companion of skill.companionFiles) {
                const escapedName = companion.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const linkPattern = new RegExp(`\\]\\(${escapedName}\\)`, 'g');
                convertedBody = convertedBody.replace(linkPattern, `](${skill.name}-${companion.name})`);
            }
        }

        return {
            convertedBody,
            instructionsContent: generateInstructionsFile(skill.name, skill.description, convertedBody),
            promptContent: generatePromptFile(skill.name, skill.description),
            registryEntry: generateRegistryEntry(skill.name, outputFormats),
            originalContent: skill.content,
        };
    }

    async importSkill(skill: SkillInfo, outputFormats: string[], generateRegistry: boolean, useLm?: boolean): Promise<void> {
        const compat = analyzeCompatibility(skill, [], {}, {});
        if (!compat.compatible) {
            vscode.window.showWarningMessage(
                `Skill "${skill.name}" is incompatible with VS Code Copilot: ${compat.issues.join('; ')}`
            );
            return;
        }

        const choice = await vscode.window.showInformationMessage(
            `Import "${skill.name}"?`,
            { modal: true },
            'Import'
        );
        if (choice !== 'Import') { return; }

        const conversion = await this.convertSkill(skill, outputFormats as OutputFormat[], useLm);

        // Resolve dependencies before writing
        const { missingSkills, missingMcpServers } = await this.resolveDependencies(skill);

        if (missingSkills.length > 0 || missingMcpServers.length > 0) {
            const parts: string[] = [];
            if (missingSkills.length > 0) {
                parts.push(`${missingSkills.length} skill(s): ${missingSkills.map(s => s.name).join(', ')}`);
            }
            if (missingMcpServers.length > 0) {
                parts.push(`${missingMcpServers.length} MCP server(s): ${missingMcpServers.map(s => s.name).join(', ')}`);
            }

            const choice = await vscode.window.showInformationMessage(
                `"${skill.name}" requires ${parts.join(' and ')}. Install dependencies?`,
                { modal: true },
                'Install All',
                'Skip Dependencies'
            );

            if (!choice) { return; }

            if (choice === 'Install All') {
                for (const depSkill of missingSkills) {
                    const depConversion = await this.convertSkill(depSkill, outputFormats as OutputFormat[], useLm);
                    await this.writeSkillFiles(depSkill, depConversion, outputFormats, generateRegistry);
                }
                for (const server of missingMcpServers) {
                    await this.importMcpServer(server);
                }
            }
        }

        await this.writeSkillFiles(skill, conversion, outputFormats, generateRegistry);
        vscode.window.showInformationMessage(`Imported skill: ${skill.name}`);
    }

    async updateSkill(skill: SkillInfo, outputFormats: string[], generateRegistry: boolean, useLm?: boolean): Promise<void> {
        const compat = analyzeCompatibility(skill, [], {}, {});
        if (!compat.compatible) {
            vscode.window.showWarningMessage(
                `Skill "${skill.name}" is incompatible with VS Code Copilot: ${compat.issues.join('; ')}`
            );
            return;
        }

        const choice = await vscode.window.showInformationMessage(
            `Update "${skill.name}" to the latest version?`,
            { modal: true },
            'Update'
        );
        if (choice !== 'Update') { return; }

        const conversion = await this.convertSkill(skill, outputFormats as OutputFormat[], useLm);
        await this.writeSkillFiles(skill, conversion, outputFormats, generateRegistry);
        vscode.window.showInformationMessage(`Updated skill: ${skill.name}`);
    }

    async importAllSkills(
        skills: SkillInfo[],
        outputFormats: string[],
        generateRegistry: boolean,
        mcpServers?: McpServerInfo[],
        useLm?: boolean
    ): Promise<BulkImportResult> {
        const result: BulkImportResult = { imported: [], failed: [] };
        if (skills.length === 0 && (!mcpServers || mcpServers.length === 0)) {
            return result;
        }

        const compatResults = skills.map(skill => ({
            skill,
            compat: analyzeCompatibility(skill, [], {}, {}),
        }));

        const compatibleSkills = compatResults.filter(r => r.compat.compatible).map(r => r.skill);
        const incompatibleCount = skills.length - compatibleSkills.length;

        if (compatibleSkills.length === 0 && (!mcpServers || mcpServers.length === 0)) {
            vscode.window.showWarningMessage(
                `All ${skills.length} skill(s) are incompatible with VS Code Copilot.`
            );
            return result;
        }

        // Resolve cross-plugin skill dependencies
        const manifest = await loadManifest(this.workspaceUri);
        const knownNames = this.getKnownSkillNames();
        const importingNames = new Set(compatibleSkills.map(s => s.name));
        const depSkills: SkillInfo[] = [];
        const depMcpServers: McpServerInfo[] = [];

        for (const skill of compatibleSkills) {
            const deps = extractSkillDependencies(skill.content, knownNames);
            for (const depName of deps) {
                if (importingNames.has(depName)) { continue; }
                if (isSkillImported(manifest, depName)) { continue; }
                const depSkill = this.findSkillByName(depName);
                if (depSkill && !depSkills.some(d => d.name === depName)) {
                    const depCompat = analyzeCompatibility(depSkill, [], {}, {});
                    if (depCompat.compatible) {
                        depSkills.push(depSkill);
                        importingNames.add(depName);
                    }
                }
            }
        }

        // Find MCP servers from dependency plugins that aren't already included
        const existingMcpNames = new Set((mcpServers ?? []).map(s => s.name));
        for (const depSkill of depSkills) {
            const depPlugin = this.allPlugins.find(p => p.skills.some(s => s.name === depSkill.name));
            if (depPlugin?.mcpServers) {
                for (const server of depPlugin.mcpServers) {
                    if (!existingMcpNames.has(server.name) && !isMcpServerImported(manifest, server.name)) {
                        depMcpServers.push(server);
                        existingMcpNames.add(server.name);
                    }
                }
            }
        }

        const allSkillsToImport = [...compatibleSkills, ...depSkills];
        const allMcpServers = [...(mcpServers ?? []), ...depMcpServers];

        const conversions: Array<{ skill: SkillInfo; conversion: ConversionResult }> = [];
        for (const skill of allSkillsToImport) {
            conversions.push({
                skill,
                conversion: await this.convertSkill(skill, outputFormats as OutputFormat[], useLm),
            });
        }

        const skillNames = allSkillsToImport.map(s => s.name);
        const depsNote = depSkills.length > 0
            ? ` (+${depSkills.length} dependencies: ${depSkills.map(s => s.name).join(', ')})`
            : '';
        const mcpDepsNote = depMcpServers.length > 0
            ? ` (+${depMcpServers.length} MCP dep(s): ${depMcpServers.map(s => s.name).join(', ')})`
            : '';
        const summary = compatibleSkills.length <= 5
            ? compatibleSkills.map(s => s.name).join(', ')
            : `${compatibleSkills.slice(0, 3).map(s => s.name).join(', ')} and ${compatibleSkills.length - 3} more`;

        const incompatibleNote = incompatibleCount > 0 ? ` (${incompatibleCount} incompatible, skipped)` : '';

        const choice = await vscode.window.showInformationMessage(
            `Import ${compatibleSkills.length} skill(s)${incompatibleNote}${depsNote}${mcpDepsNote}: ${summary}?`,
            { modal: true },
            'Import All'
        );

        if (choice !== 'Import All') {
            return result;
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Importing skills',
                cancellable: true,
            },
            async (progress, token) => {
                const total = allSkillsToImport.length + allMcpServers.length;
                const increment = total > 0 ? 100 / total : 100;

                for (const { skill, conversion } of conversions) {
                    if (token.isCancellationRequested) { break; }
                    progress.report({ message: `${skill.name}...`, increment });

                    try {
                        await this.writeSkillFiles(skill, conversion, outputFormats, generateRegistry);
                        result.imported.push(skill.name);
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : String(err);
                        result.failed.push({ name: skill.name, error: msg });
                    }
                }

                if (allMcpServers.length > 0 && !token.isCancellationRequested) {
                    for (const server of allMcpServers) {
                        if (token.isCancellationRequested) { break; }
                        progress.report({ message: `MCP: ${server.name}...`, increment });

                        try {
                            const manifest = await loadManifest(this.workspaceUri);
                            if (!isMcpServerImported(manifest, server.name)) {
                                await this.importMcpServer(server);
                            }
                        } catch (err) {
                            const msg = err instanceof Error ? err.message : String(err);
                            result.failed.push({ name: `MCP:${server.name}`, error: msg });
                        }
                    }
                }
            }
        );

        if (result.failed.length === 0) {
            vscode.window.showInformationMessage(
                `Successfully imported ${result.imported.length} skill(s).`
            );
        } else {
            vscode.window.showWarningMessage(
                `Imported ${result.imported.length}, ${result.failed.length} failed: ${result.failed.map(f => f.name).join(', ')}`
            );
        }

        return result;
    }

    private async writeSkillFiles(
        skill: SkillInfo,
        conversion: ConversionResult,
        outputFormats: string[],
        generateRegistry: boolean
    ): Promise<void> {
        const hash = computeHash(skill.content);
        const source = `${skill.pluginName}@${skill.marketplace}`;

        if (outputFormats.includes('instructions')) {
            await writeInstructionsFile(this.workspaceUri, skill.name, conversion.instructionsContent);
        }
        if (outputFormats.includes('prompts')) {
            const promptsOnly = !outputFormats.includes('instructions');
            const promptContent = promptsOnly
                ? generateFullPromptFile(skill.name, skill.description, conversion.convertedBody)
                : conversion.promptContent;
            await writePromptFile(this.workspaceUri, skill.name, promptContent);
        }

        if (skill.companionFiles?.length) {
            await writeCompanionFiles(
                this.workspaceUri,
                skill.name,
                skill.companionFiles,
                (content) => convertSkillContent(content, outputFormats as OutputFormat[])
            );
        }

        let manifest = await loadManifest(this.workspaceUri);
        manifest = recordImport(manifest, skill.name, source, hash);

        if (isMetaOrchestratorSkill(skill)) {
            manifest = setSkillEmbedded(manifest, skill.name, true);
            await writeInstructionsFile(this.workspaceUri, skill.name, conversion.instructionsContent);
        }

        await saveManifest(this.workspaceUri, manifest);

        if (generateRegistry) {
            await this.updateRegistry(manifest, outputFormats as OutputFormat[]);
        }
    }

    async removeSkill(skillName: string, generateRegistry: boolean, outputFormats?: OutputFormat[]): Promise<void> {
        await removeSkillFiles(this.workspaceUri, skillName);

        let manifest = await loadManifest(this.workspaceUri);
        manifest = removeSkillRecord(manifest, skillName);
        await saveManifest(this.workspaceUri, manifest);

        if (generateRegistry) {
            await this.updateRegistry(manifest, outputFormats);
        }

        vscode.window.showInformationMessage(`Removed skill: ${skillName}`);
    }

    async removeAllSkills(
        skills: SkillInfo[],
        generateRegistry: boolean,
        mcpServers?: McpServerInfo[],
        outputFormats?: OutputFormat[]
    ): Promise<BulkImportResult> {
        const result: BulkImportResult = { imported: [], failed: [] };
        let manifest = await loadManifest(this.workspaceUri);

        const importedSkills = skills.filter(s => isSkillImported(manifest, s.name));
        const importedServers = (mcpServers ?? []).filter(s => isMcpServerImported(manifest, s.name));

        if (importedSkills.length === 0 && importedServers.length === 0) {
            vscode.window.showInformationMessage('No imported skills or MCP servers to remove.');
            return result;
        }

        const parts: string[] = [];
        if (importedSkills.length > 0) {
            parts.push(`${importedSkills.length} skill(s)`);
        }
        if (importedServers.length > 0) {
            parts.push(`${importedServers.length} MCP server(s)`);
        }

        const choice = await vscode.window.showWarningMessage(
            `Remove ${parts.join(' and ')} from this project?`,
            { modal: true },
            'Remove All'
        );

        if (choice !== 'Remove All') {
            return result;
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Removing skills',
                cancellable: true,
            },
            async (progress, token) => {
                const total = importedSkills.length + importedServers.length;
                const increment = total > 0 ? 100 / total : 100;

                for (const skill of importedSkills) {
                    if (token.isCancellationRequested) { break; }
                    progress.report({ message: `${skill.name}...`, increment });

                    try {
                        await removeSkillFiles(this.workspaceUri, skill.name);
                        manifest = removeSkillRecord(manifest, skill.name);
                        result.imported.push(skill.name);
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : String(err);
                        result.failed.push({ name: skill.name, error: msg });
                    }
                }

                for (const server of importedServers) {
                    if (token.isCancellationRequested) { break; }
                    progress.report({ message: `MCP: ${server.name}...`, increment });

                    try {
                        const existing = await readMcpJson(this.workspaceUri);
                        const updated = removeServerFromConfig(existing, server.name);
                        await writeMcpJson(this.workspaceUri, updated);
                        manifest = removeMcpRecord(manifest, server.name);
                        result.imported.push(`MCP:${server.name}`);
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : String(err);
                        result.failed.push({ name: `MCP:${server.name}`, error: msg });
                    }
                }
            }
        );

        await saveManifest(this.workspaceUri, manifest);

        if (generateRegistry) {
            await this.updateRegistry(manifest, outputFormats);
        }

        if (result.failed.length === 0) {
            vscode.window.showInformationMessage(
                `Removed ${result.imported.length} item(s) from project.`
            );
        } else {
            vscode.window.showWarningMessage(
                `Removed ${result.imported.length}, ${result.failed.length} failed: ${result.failed.map(f => f.name).join(', ')}`
            );
        }

        return result;
    }

    async embedSkill(skillName: string): Promise<void> {
        let manifest = await loadManifest(this.workspaceUri);
        if (!isSkillImported(manifest, skillName)) {
            vscode.window.showWarningMessage(`Skill "${skillName}" is not imported.`);
            return;
        }

        const skillInfo = this.findSkillByName(skillName);
        if (skillInfo) {
            const conversion = await this.convertSkill(skillInfo);
            await writeInstructionsFile(this.workspaceUri, skillName, conversion.instructionsContent);
        }

        manifest = setSkillEmbedded(manifest, skillName, true);
        await saveManifest(this.workspaceUri, manifest);
        await this.updateRegistry(manifest);
        vscode.window.showInformationMessage(`Skill "${skillName}" is now always active via instructions file.`);
    }

    async unembedSkill(skillName: string): Promise<void> {
        let manifest = await loadManifest(this.workspaceUri);

        const instructionsFile = vscode.Uri.joinPath(
            this.workspaceUri, '.github', 'instructions', `${skillName}.instructions.md`
        );
        try { await vscode.workspace.fs.delete(instructionsFile); } catch { /* may not exist */ }

        manifest = setSkillEmbedded(manifest, skillName, false);
        await saveManifest(this.workspaceUri, manifest);
        await this.updateRegistry(manifest);
        vscode.window.showInformationMessage(`Skill "${skillName}" is no longer always active.`);
    }

    async rebuildRegistry(outputFormats?: OutputFormat[]): Promise<void> {
        const manifest = await loadManifest(this.workspaceUri);
        await this.updateRegistry(manifest, outputFormats);
    }

    private async updateRegistry(manifest: import('./types').BridgeManifest, outputFormats?: OutputFormat[]): Promise<void> {
        const allSkills = Object.keys(manifest.skills);
        const entries = allSkills
            .filter(name => manifest.skills[name].embedded === true)
            .map(name => generateRegistryEntry(name, outputFormats));
        const hasPromptSkills = allSkills.length > entries.length;
        await updateCopilotInstructions(this.workspaceUri, entries, hasPromptSkills);
    }

    setPlugins(plugins: PluginInfo[]) {
        this.allPlugins = plugins;
    }

    setDepGraph(depGraph: DependencyGraph) {
        this._depGraph = depGraph;
    }

    getPlugins(): PluginInfo[] {
        return this.allPlugins;
    }

    getPluginsByMarketplace(marketplace: string): PluginInfo[] {
        return this.allPlugins.filter(p => p.marketplace === marketplace);
    }

    /** Collect plugins from a marketplace and all its transitive dependency repos */
    getPluginsByMarketplaceTransitive(marketplace: string): PluginInfo[] {
        const repos = new Set<string>([marketplace]);
        const queue = [marketplace];
        while (queue.length > 0) {
            const repo = queue.shift()!;
            for (const dep of this._depGraph.edges.get(repo) ?? []) {
                if (!repos.has(dep)) {
                    repos.add(dep);
                    queue.push(dep);
                }
            }
        }
        return this.allPlugins.filter(p => p.marketplace !== undefined && repos.has(p.marketplace));
    }

    async importMcpServer(server: McpServerInfo): Promise<void> {
        const converted = convertMcpServers([server]);

        const existing = await readMcpJson(this.workspaceUri);

        let manifest = await loadManifest(this.workspaceUri);
        const managedNames = Object.keys(manifest.mcpServers ?? {});

        const merged = mergeMcpConfigs(existing, converted, managedNames);
        await writeMcpJson(this.workspaceUri, merged);

        const source = `${server.pluginName}@${server.marketplace}`;
        manifest = recordMcpImport(manifest, server.name, source);
        await saveManifest(this.workspaceUri, manifest);

        vscode.window.showInformationMessage(`Imported MCP server: ${server.name}`);
    }

    async importAllMcpServers(servers: McpServerInfo[]): Promise<void> {
        for (const server of servers) {
            const manifest = await loadManifest(this.workspaceUri);
            if (!isMcpServerImported(manifest, server.name)) {
                await this.importMcpServer(server);
            }
        }
    }

    async removeMcpServer(serverName: string): Promise<void> {
        let manifest = await loadManifest(this.workspaceUri);
        if (!isMcpServerImported(manifest, serverName)) {
            return;
        }

        const existing = await readMcpJson(this.workspaceUri);
        const updated = removeServerFromConfig(existing, serverName);
        await writeMcpJson(this.workspaceUri, updated);

        manifest = removeMcpRecord(manifest, serverName);
        await saveManifest(this.workspaceUri, manifest);

        vscode.window.showInformationMessage(`Removed MCP server: ${serverName}`);
    }

    private getKnownSkillNames(): Set<string> {
        const names = new Set<string>();
        for (const plugin of this.allPlugins) {
            for (const skill of plugin.skills) {
                names.add(skill.name);
            }
        }
        return names;
    }

    async resolveDependencies(skill: SkillInfo): Promise<{
        missingSkills: SkillInfo[];
        missingMcpServers: McpServerInfo[];
    }> {
        const manifest = await loadManifest(this.workspaceUri);
        const missingSkills: SkillInfo[] = [];
        const missingMcpServers: McpServerInfo[] = [];

        // Find missing skill cross-references (filtered against known skills)
        const knownNames = this.getKnownSkillNames();
        const skillDeps = extractSkillDependencies(skill.content, knownNames);
        for (const depName of skillDeps) {
            if (depName === skill.name) { continue; }
            if (isSkillImported(manifest, depName)) { continue; }
            const depSkill = this.findSkillByName(depName);
            if (depSkill) {
                const depCompat = analyzeCompatibility(depSkill, [], {}, {});
                if (depCompat.compatible) {
                    missingSkills.push(depSkill);
                }
            }
        }

        // Find missing MCP servers from the same plugin
        const plugin = this.allPlugins.find(p =>
            p.skills.some(s => s.name === skill.name)
        );
        if (plugin?.mcpServers) {
            for (const server of plugin.mcpServers) {
                if (!isMcpServerImported(manifest, server.name)) {
                    missingMcpServers.push(server);
                }
            }
        }

        return { missingSkills, missingMcpServers };
    }

    private findSkillByName(name: string): SkillInfo | undefined {
        for (const plugin of this.allPlugins) {
            const skill = plugin.skills.find(s => s.name === name);
            if (skill) { return skill; }
        }
        return undefined;
    }
}
