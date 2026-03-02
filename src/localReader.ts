import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { SkillInfo, PluginInfo, PluginJson, McpServerInfo, ClaudeMcpServerConfig } from './types';
import { parseSkillFrontmatter } from './parser';

export function resolveClaudeCachePath(configPath: string): string {
    if (configPath.startsWith('~')) {
        return path.join(os.homedir(), configPath.slice(1));
    }
    return configPath;
}

export function parsePluginJson(content: string): PluginJson {
    return JSON.parse(content) as PluginJson;
}

export function buildSkillInfo(
    name: string,
    description: string,
    content: string,
    pluginName: string,
    pluginVersion: string,
    marketplace: string,
    filePath: string
): SkillInfo {
    return {
        name,
        description,
        content,
        pluginName,
        pluginVersion,
        marketplace,
        source: 'local',
        filePath,
    };
}

export function parseMcpJson(
    raw: string,
    pluginName: string,
    pluginVersion: string,
    marketplace: string,
): McpServerInfo[] {
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            return [];
        }
        return Object.entries(parsed).map(([name, config]) => ({
            name,
            config: config as ClaudeMcpServerConfig,
            pluginName,
            pluginVersion,
            marketplace,
        }));
    } catch {
        return [];
    }
}

export async function discoverLocalPlugins(cachePath: string): Promise<PluginInfo[]> {
    const resolvedPath = resolveClaudeCachePath(cachePath);
    const cacheUri = vscode.Uri.file(resolvedPath);
    const plugins: PluginInfo[] = [];

    let marketplaceDirs: [string, vscode.FileType][];
    try {
        marketplaceDirs = await vscode.workspace.fs.readDirectory(cacheUri);
    } catch {
        return plugins;
    }

    for (const [marketplaceName, marketplaceType] of marketplaceDirs) {
        if (marketplaceType !== vscode.FileType.Directory) { continue; }

        const marketplaceUri = vscode.Uri.joinPath(cacheUri, marketplaceName);
        let pluginDirs: [string, vscode.FileType][];
        try {
            pluginDirs = await vscode.workspace.fs.readDirectory(marketplaceUri);
        } catch { continue; }

        for (const [pluginDirName, pluginDirType] of pluginDirs) {
            if (pluginDirType !== vscode.FileType.Directory) { continue; }

            const pluginDirUri = vscode.Uri.joinPath(marketplaceUri, pluginDirName);
            let versionDirs: [string, vscode.FileType][];
            try {
                versionDirs = await vscode.workspace.fs.readDirectory(pluginDirUri);
            } catch { continue; }

            const versions = versionDirs
                .filter(([, t]) => t === vscode.FileType.Directory)
                .map(([name]) => name)
                .sort()
                .reverse();

            if (versions.length === 0) { continue; }
            const latestVersion = versions[0];
            const versionUri = vscode.Uri.joinPath(pluginDirUri, latestVersion);

            const pluginJsonUri = vscode.Uri.joinPath(versionUri, '.claude-plugin', 'plugin.json');
            let pluginMeta: PluginJson;
            try {
                const raw = await vscode.workspace.fs.readFile(pluginJsonUri);
                pluginMeta = parsePluginJson(Buffer.from(raw).toString('utf-8'));
            } catch { continue; }

            const skillsDir = vscode.Uri.joinPath(versionUri, pluginMeta.skills ?? 'skills');
            const skills = await discoverSkillsInDir(skillsDir, pluginMeta.name, latestVersion, marketplaceName);

            // Discover MCP servers
            let mcpServers: McpServerInfo[] = [];
            try {
                const mcpJsonUri = vscode.Uri.joinPath(versionUri, '.mcp.json');
                const mcpRaw = await vscode.workspace.fs.readFile(mcpJsonUri);
                mcpServers = parseMcpJson(
                    Buffer.from(mcpRaw).toString('utf-8'),
                    pluginMeta.name,
                    latestVersion,
                    marketplaceName,
                );
            } catch {
                // No .mcp.json — that's fine
            }

            plugins.push({
                name: pluginMeta.name,
                description: pluginMeta.description,
                version: latestVersion,
                author: pluginMeta.author,
                skills,
                mcpServers,
                marketplace: marketplaceName,
                source: 'local',
            });
        }
    }

    return plugins;
}

async function discoverSkillsInDir(
    skillsUri: vscode.Uri,
    pluginName: string,
    pluginVersion: string,
    marketplace: string
): Promise<SkillInfo[]> {
    const skills: SkillInfo[] = [];

    let entries: [string, vscode.FileType][];
    try {
        entries = await vscode.workspace.fs.readDirectory(skillsUri);
    } catch {
        return skills;
    }

    for (const [skillDirName, skillDirType] of entries) {
        if (skillDirType !== vscode.FileType.Directory) { continue; }

        const skillMdUri = vscode.Uri.joinPath(skillsUri, skillDirName, 'SKILL.md');
        try {
            const raw = await vscode.workspace.fs.readFile(skillMdUri);
            const content = Buffer.from(raw).toString('utf-8');
            const parsed = parseSkillFrontmatter(content);

            skills.push(buildSkillInfo(
                parsed.name || skillDirName,
                parsed.description,
                content,
                pluginName,
                pluginVersion,
                marketplace,
                skillMdUri.fsPath,
            ));
        } catch {
            // SKILL.md doesn't exist in this dir, skip
        }
    }

    return skills;
}
