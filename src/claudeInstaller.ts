import * as vscode from 'vscode';
import { PluginInfo } from './types';
import { resolveClaudeCachePath } from './localReader';
import { fetchFileContent } from './remoteReader';

export function slugifySkillName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

export async function installPluginInClaudeCache(
    plugin: PluginInfo,
    cachePath: string,
    pluginJsonContent: string,
): Promise<void> {
    const resolvedPath = resolveClaudeCachePath(cachePath);
    const cacheUri = vscode.Uri.file(resolvedPath);
    const marketplaceSlug = plugin.marketplace.replace(/\//g, '-');

    const versionUri = vscode.Uri.joinPath(cacheUri, marketplaceSlug, plugin.name, plugin.version);

    // Write plugin.json
    const pluginJsonDir = vscode.Uri.joinPath(versionUri, '.claude-plugin');
    await vscode.workspace.fs.createDirectory(pluginJsonDir);
    await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(pluginJsonDir, 'plugin.json'),
        Buffer.from(pluginJsonContent, 'utf-8'),
    );

    // Write skills
    for (const skill of plugin.skills) {
        const skillSlug = slugifySkillName(skill.name);
        const skillDir = vscode.Uri.joinPath(versionUri, 'skills', skillSlug);
        await vscode.workspace.fs.createDirectory(skillDir);
        await vscode.workspace.fs.writeFile(
            vscode.Uri.joinPath(skillDir, 'SKILL.md'),
            Buffer.from(skill.content, 'utf-8'),
        );

        // Write companion files
        if (skill.companionFiles) {
            for (const companion of skill.companionFiles) {
                await vscode.workspace.fs.writeFile(
                    vscode.Uri.joinPath(skillDir, companion.name),
                    Buffer.from(companion.content, 'utf-8'),
                );
            }
        }
    }

    // Write .mcp.json if plugin has MCP servers
    if (plugin.mcpServers && plugin.mcpServers.length > 0) {
        const mcpObject: Record<string, unknown> = {};
        for (const server of plugin.mcpServers) {
            mcpObject[server.name] = server.config;
        }
        await vscode.workspace.fs.writeFile(
            vscode.Uri.joinPath(versionUri, '.mcp.json'),
            Buffer.from(JSON.stringify(mcpObject, null, 2), 'utf-8'),
        );
    }
}

export async function fetchPluginJson(plugin: PluginInfo): Promise<string> {
    return fetchFileContent(plugin.marketplace, '.claude-plugin/plugin.json');
}
