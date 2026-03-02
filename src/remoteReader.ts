import { SkillInfo, PluginInfo, PluginJson, MarketplaceJson, McpServerInfo } from './types';
import { parseSkillFrontmatter } from './parser';
import { buildAuthHeaders, getGitHubToken } from './auth';
import { parseMcpJson } from './localReader';

export function buildGitHubApiUrl(repo: string, path: string, ref?: string): string {
    const base = `https://api.github.com/repos/${repo}/contents/${path}`;
    return ref ? `${base}?ref=${ref}` : base;
}

export function parseGitHubContentsResponse(response: { content: string; encoding: string }): string {
    if (response.encoding === 'base64') {
        return Buffer.from(response.content, 'base64').toString('utf-8');
    }
    return response.content;
}

export function buildRemoteSkillInfo(
    name: string,
    description: string,
    content: string,
    pluginName: string,
    pluginVersion: string,
    repo: string
): SkillInfo {
    return {
        name,
        description,
        content,
        pluginName,
        pluginVersion,
        marketplace: repo,
        source: 'remote',
    };
}

async function fetchJson(url: string): Promise<any> {
    const token = await getGitHubToken();
    const headers = buildAuthHeaders(token);
    const response = await fetch(url, { headers });
    if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
}

async function fetchFileContent(repo: string, path: string): Promise<string> {
    const url = buildGitHubApiUrl(repo, path);
    const data = await fetchJson(url);
    return parseGitHubContentsResponse(data);
}

export function normalizeMarketplaceJson(raw: MarketplaceJson): Array<{ name: string; description: string; version: string; source: string }> {
    const plugins = raw.plugins ?? raw.marketplace?.plugins ?? [];
    return plugins.map(p => ({
        name: p.name,
        description: p.description,
        version: p.version,
        source: p.source ?? p.path ?? './',
    }));
}

export async function discoverRemotePlugins(repo: string): Promise<PluginInfo[]> {
    const plugins: PluginInfo[] = [];

    let pluginEntries: Array<{ name: string; description: string; version: string; source: string }> = [];

    try {
        const marketplaceContent = await fetchFileContent(repo, '.claude-plugin/marketplace.json');
        const marketplace: MarketplaceJson = JSON.parse(marketplaceContent);
        pluginEntries = normalizeMarketplaceJson(marketplace);
    } catch {
        try {
            const pluginContent = await fetchFileContent(repo, '.claude-plugin/plugin.json');
            const pluginMeta: PluginJson = JSON.parse(pluginContent);
            pluginEntries = [{
                name: pluginMeta.name,
                description: pluginMeta.description,
                version: pluginMeta.version,
                source: './',
            }];
        } catch {
            return plugins;
        }
    }

    for (const entry of pluginEntries) {
        const basePath = entry.source === './' ? '' : entry.source.replace(/\/$/, '') + '/';
        const skillsPath = basePath + 'skills';

        let skillDirs: Array<{ name: string; type: string }>;
        try {
            const url = buildGitHubApiUrl(repo, skillsPath);
            skillDirs = await fetchJson(url);
        } catch { continue; }

        const skills: SkillInfo[] = [];
        for (const dir of skillDirs) {
            if (dir.type !== 'dir') { continue; }

            try {
                const skillContent = await fetchFileContent(repo, `${skillsPath}/${dir.name}/SKILL.md`);
                const parsed = parseSkillFrontmatter(skillContent);
                skills.push(buildRemoteSkillInfo(
                    parsed.name || dir.name,
                    parsed.description,
                    skillContent,
                    entry.name,
                    entry.version,
                    repo,
                ));
            } catch {
                // SKILL.md doesn't exist
            }
        }

        let mcpServers: McpServerInfo[] = [];
        try {
            const mcpPath = basePath + '.mcp.json';
            const mcpContent = await fetchFileContent(repo, mcpPath);
            mcpServers = parseMcpJson(mcpContent, entry.name, entry.version, repo);
        } catch {
            // No .mcp.json — that's fine
        }

        plugins.push({
            name: entry.name,
            description: entry.description,
            version: entry.version,
            skills,
            mcpServers: mcpServers.length > 0 ? mcpServers : undefined,
            marketplace: repo,
            source: 'remote',
        });
    }

    return plugins;
}

export async function fetchLatestCommitSha(repo: string): Promise<string> {
    const url = `https://api.github.com/repos/${repo}/commits?per_page=1`;
    const commits = await fetchJson(url);
    return commits[0]?.sha ?? '';
}
