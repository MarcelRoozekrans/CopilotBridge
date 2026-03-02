import * as vscode from 'vscode';
import { SkillInfo, PluginInfo, ConversionResult, McpServerInfo } from './types';
import { convertSkillContent, generateInstructionsFile, generatePromptFile, generateRegistryEntry } from './converter';
import { parseSkillFrontmatter } from './parser';
import { computeHash, loadManifest, saveManifest, recordImport, removeSkillRecord, recordMcpImport, removeMcpRecord, isMcpServerImported } from './stateManager';
import { writeInstructionsFile, writePromptFile, updateCopilotInstructions, removeSkillFiles } from './fileWriter';
import { discoverLocalPlugins } from './localReader';
import { discoverRemotePlugins } from './remoteReader';
import { convertMcpServers } from './mcpConverter';
import { readMcpJson, writeMcpJson, mergeMcpConfigs, removeServerFromConfig } from './mcpWriter';

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

        // Merge: if a plugin exists both locally and remotely, mark source as 'both'
        const merged = new Map<string, PluginInfo>();

        for (const p of localPlugins) {
            merged.set(p.name, p);
        }

        for (const p of remotePlugins) {
            const existing = merged.get(p.name);
            if (existing) {
                existing.source = 'both';
                const existingNames = new Set(existing.skills.map(s => s.name));
                for (const skill of p.skills) {
                    if (!existingNames.has(skill.name)) {
                        existing.skills.push(skill);
                    }
                }
            } else {
                merged.set(p.name, p);
            }
        }

        return Array.from(merged.values());
    }

    convertSkill(skill: SkillInfo): ConversionResult {
        const parsed = parseSkillFrontmatter(skill.content);
        const convertedBody = convertSkillContent(parsed.body);

        return {
            instructionsContent: generateInstructionsFile(skill.name, skill.description, convertedBody),
            promptContent: generatePromptFile(skill.name, skill.description),
            registryEntry: generateRegistryEntry(skill.name, skill.description),
            originalContent: skill.content,
        };
    }

    async importSkill(skill: SkillInfo, outputFormats: string[], generateRegistry: boolean): Promise<void> {
        const conversion = this.convertSkill(skill);
        const hash = computeHash(skill.content);
        const source = `${skill.pluginName}@${skill.marketplace}`;

        // Show diff preview
        const accepted = await this.showPreview(skill, conversion);
        if (!accepted) { return; }

        // Write files
        if (outputFormats.includes('instructions')) {
            await writeInstructionsFile(this.workspaceUri, skill.name, conversion.instructionsContent);
        }
        if (outputFormats.includes('prompts')) {
            await writePromptFile(this.workspaceUri, skill.name, conversion.promptContent);
        }

        // Update manifest
        let manifest = await loadManifest(this.workspaceUri);
        manifest = recordImport(manifest, skill.name, source, hash);
        await saveManifest(this.workspaceUri, manifest);

        // Update registry
        if (generateRegistry) {
            const entries = Object.keys(manifest.skills).map(name => {
                const skillData = this.findSkillByName(name);
                return generateRegistryEntry(name, skillData?.description ?? '');
            });
            await updateCopilotInstructions(this.workspaceUri, entries);
        }

        vscode.window.showInformationMessage(`Imported skill: ${skill.name}`);
    }

    async removeSkill(skillName: string, generateRegistry: boolean): Promise<void> {
        await removeSkillFiles(this.workspaceUri, skillName);

        let manifest = await loadManifest(this.workspaceUri);
        manifest = removeSkillRecord(manifest, skillName);
        await saveManifest(this.workspaceUri, manifest);

        if (generateRegistry) {
            const entries = Object.keys(manifest.skills).map(name => {
                return generateRegistryEntry(name, '');
            });
            await updateCopilotInstructions(this.workspaceUri, entries);
        }

        vscode.window.showInformationMessage(`Removed skill: ${skillName}`);
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

        return choice === 'Accept';
    }

    setPlugins(plugins: PluginInfo[]) {
        this.allPlugins = plugins;
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
