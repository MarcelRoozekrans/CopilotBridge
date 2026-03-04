import * as vscode from 'vscode';
import { SkillInfo, PluginInfo, ConversionResult, McpServerInfo, BulkImportResult } from './types';
import { convertSkillContent, generateInstructionsFile, generatePromptFile, generateFullPromptFile, generateRegistryEntry, OutputFormat } from './converter';
import { parseSkillFrontmatter } from './parser';
import { computeHash, loadManifest, saveManifest, recordImport, removeSkillRecord, recordMcpImport, removeMcpRecord, isMcpServerImported, setSkillEmbedded, isSkillImported } from './stateManager';
import { writeInstructionsFile, writePromptFile, updateCopilotInstructions, removeSkillFiles } from './fileWriter';
import { discoverLocalPlugins } from './localReader';
import { discoverRemotePlugins } from './remoteReader';
import { convertMcpServers } from './mcpConverter';
import { readMcpJson, writeMcpJson, mergeMcpConfigs, removeServerFromConfig } from './mcpWriter';
import { analyzeCompatibility } from './compatAnalyzer';

export class ImportService {
    private allPlugins: PluginInfo[] = [];

    constructor(private workspaceUri: vscode.Uri) {}

    async discoverAllPlugins(cachePath: string, remoteRepos: string[]): Promise<PluginInfo[]> {
        const localPlugins = await discoverLocalPlugins(cachePath);
        const remoteResults = await Promise.allSettled(
            remoteRepos.map(repo => discoverRemotePlugins(repo))
        );

        const remotePlugins: PluginInfo[] = [];
        for (const result of remoteResults) {
            if (result.status === 'fulfilled') {
                remotePlugins.push(...result.value);
            }
        }

        return this.mergePluginLists(localPlugins, remotePlugins);
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

    convertSkill(skill: SkillInfo, outputFormats?: OutputFormat[]): ConversionResult {
        const parsed = parseSkillFrontmatter(skill.content);
        const convertedBody = convertSkillContent(parsed.body, outputFormats);

        return {
            convertedBody,
            instructionsContent: generateInstructionsFile(skill.name, skill.description, convertedBody),
            promptContent: generatePromptFile(skill.name, skill.description),
            registryEntry: generateRegistryEntry(skill.name, outputFormats),
            originalContent: skill.content,
        };
    }

    async importSkill(skill: SkillInfo, outputFormats: string[], generateRegistry: boolean): Promise<void> {
        const compat = analyzeCompatibility(skill, [], {}, {});
        if (!compat.compatible) {
            vscode.window.showWarningMessage(
                `Skill "${skill.name}" is incompatible with VS Code Copilot: ${compat.issues.join('; ')}`
            );
            return;
        }

        const conversion = this.convertSkill(skill, outputFormats as OutputFormat[]);

        const accepted = await this.showPreview(skill, conversion);
        if (!accepted) { return; }

        await this.writeSkillFiles(skill, conversion, outputFormats, generateRegistry);
        vscode.window.showInformationMessage(`Imported skill: ${skill.name}`);
    }

    async importAllSkills(
        skills: SkillInfo[],
        outputFormats: string[],
        generateRegistry: boolean,
        mcpServers?: McpServerInfo[]
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

        const conversions = compatibleSkills.map(skill => ({
            skill,
            conversion: this.convertSkill(skill, outputFormats as OutputFormat[]),
        }));

        const skillNames = compatibleSkills.map(s => s.name);
        const summary = compatibleSkills.length <= 5
            ? skillNames.join(', ')
            : `${skillNames.slice(0, 3).join(', ')} and ${compatibleSkills.length - 3} more`;

        const incompatibleNote = incompatibleCount > 0 ? ` (${incompatibleCount} incompatible, skipped)` : '';

        const choice = await vscode.window.showInformationMessage(
            `Import ${compatibleSkills.length} skill(s)${incompatibleNote}: ${summary}?`,
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
                const total = compatibleSkills.length + (mcpServers?.length ?? 0);
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

                if (mcpServers?.length && !token.isCancellationRequested) {
                    for (const server of mcpServers) {
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

        let manifest = await loadManifest(this.workspaceUri);
        manifest = recordImport(manifest, skill.name, source, hash);
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
            const conversion = this.convertSkill(skillInfo);
            await writeInstructionsFile(this.workspaceUri, skillName, conversion.instructionsContent);
        }

        manifest = setSkillEmbedded(manifest, skillName, true);
        await saveManifest(this.workspaceUri, manifest);
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

    private async showPreview(skill: SkillInfo, conversion: ConversionResult): Promise<boolean> {
        const originalDoc = await vscode.workspace.openTextDocument({
            content: skill.content,
            language: 'markdown',
        });
        const convertedDoc = await vscode.workspace.openTextDocument({
            content: conversion.instructionsContent,
            language: 'markdown',
        });

        await vscode.commands.executeCommand(
            'vscode.diff',
            originalDoc.uri,
            convertedDoc.uri,
            `${skill.name}: Claude → Copilot`
        );

        const choice = await vscode.window.showInformationMessage(
            `Import "${skill.name}" with the shown conversion?`,
            'Accept',
            'Cancel'
        );

        // Close the diff tab regardless of outcome
        try {
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        } catch {
            // Best-effort: editor may already be closed
        }

        return choice === 'Accept';
    }

    setPlugins(plugins: PluginInfo[]) {
        this.allPlugins = plugins;
    }

    getPluginsByMarketplace(marketplace: string): PluginInfo[] {
        return this.allPlugins.filter(p => p.marketplace === marketplace);
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

    private findSkillByName(name: string): SkillInfo | undefined {
        for (const plugin of this.allPlugins) {
            const skill = plugin.skills.find(s => s.name === name);
            if (skill) { return skill; }
        }
        return undefined;
    }
}
