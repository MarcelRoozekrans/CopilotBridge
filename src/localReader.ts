import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { SkillInfo, PluginInfo, PluginJson, McpServerInfo, ClaudeMcpServerConfig, CompanionFile } from './types';
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
    filePath: string,
    companionFiles?: CompanionFile[]
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
        companionFiles: companionFiles && companionFiles.length > 0 ? companionFiles : undefined,
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
        return mcpObjectToServers(parsed, pluginName, pluginVersion, marketplace);
    } catch {
        return [];
    }
}

/** Convert a Record<string, ClaudeMcpServerConfig> object into McpServerInfo[] */
export function mcpObjectToServers(
    obj: unknown,
    pluginName: string,
    pluginVersion: string,
    marketplace: string,
): McpServerInfo[] {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
        return [];
    }
    return Object.entries(obj).map(([name, config]) => ({
        name,
        config: config as ClaudeMcpServerConfig,
        pluginName,
        pluginVersion,
        marketplace,
    }));
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

            // Discover MCP servers from plugin.json (inline object or path) with .mcp.json fallback
            let mcpServers: McpServerInfo[] = [];
            const mcpField = pluginMeta.mcpServers ?? pluginMeta.mcp_servers;
            if (typeof mcpField === 'object') {
                // Inline MCP server configs in plugin.json
                mcpServers = mcpObjectToServers(mcpField, pluginMeta.name, latestVersion, marketplaceName);
            } else {
                const mcpPaths = typeof mcpField === 'string'
                    ? [mcpField.replace(/^\.\//, ''), '.mcp.json']
                    : ['.mcp.json'];
                for (const mcpRelPath of mcpPaths) {
                    try {
                        const mcpJsonUri = vscode.Uri.joinPath(versionUri, mcpRelPath);
                        const mcpRaw = await vscode.workspace.fs.readFile(mcpJsonUri);
                        mcpServers = parseMcpJson(
                            Buffer.from(mcpRaw).toString('utf-8'),
                            pluginMeta.name,
                            latestVersion,
                            marketplaceName,
                        );
                        if (mcpServers.length > 0) { break; }
                    } catch {
                        // This path didn't work — try next
                    }
                }
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

        const skillDirUri = vscode.Uri.joinPath(skillsUri, skillDirName);
        const skillMdUri = vscode.Uri.joinPath(skillDirUri, 'SKILL.md');
        try {
            const raw = await vscode.workspace.fs.readFile(skillMdUri);
            const content = Buffer.from(raw).toString('utf-8');
            const parsed = parseSkillFrontmatter(content);

            const companionFiles: CompanionFile[] = [];
            try {
                const dirEntries = await vscode.workspace.fs.readDirectory(skillDirUri);
                for (const [fileName, fileType] of dirEntries) {
                    if (fileType !== vscode.FileType.File) { continue; }
                    if (fileName === 'SKILL.md') { continue; }
                    if (!fileName.endsWith('.md')) { continue; }
                    const fileUri = vscode.Uri.joinPath(skillDirUri, fileName);
                    const fileRaw = await vscode.workspace.fs.readFile(fileUri);
                    companionFiles.push({
                        name: fileName,
                        content: Buffer.from(fileRaw).toString('utf-8'),
                    });
                }
            } catch { /* directory read failed — skip companions */ }

            skills.push(buildSkillInfo(
                parsed.name || skillDirName,
                parsed.description,
                content,
                pluginName,
                pluginVersion,
                marketplace,
                skillMdUri.fsPath,
                companionFiles,
            ));
        } catch {
            // SKILL.md doesn't exist in this dir, skip
        }
    }

    return skills;
}
