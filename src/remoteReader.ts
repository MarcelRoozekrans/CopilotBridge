import { SkillInfo, PluginInfo, PluginJson, MarketplaceJson, McpServerInfo, CompanionFile } from './types';
import { parseSkillFrontmatter } from './parser';
import { buildAuthHeaders, getGitHubToken } from './auth';
import { parseMcpJson, mcpObjectToServers } from './localReader';
import { getLogger } from './logger';

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
    repo: string,
    companionFiles?: CompanionFile[]
): SkillInfo {
    return {
        name,
        description,
        content,
        pluginName,
        pluginVersion,
        marketplace: repo,
        source: 'remote',
        companionFiles: companionFiles && companionFiles.length > 0 ? companionFiles : undefined,
    };
}

export class GitHubApiError extends Error {
    constructor(public readonly status: number, statusText: string) {
        super(`GitHub API error: ${status} ${statusText}`);
        this.name = 'GitHubApiError';
    }

    get requiresAuth(): boolean {
        return this.status === 401 || this.status === 403;
    }
}

let cachedToken: string | undefined;
let tokenPromise: Promise<string | undefined> | undefined;

async function getCachedToken(): Promise<string | undefined> {
    if (!tokenPromise) {
        tokenPromise = getGitHubToken().then(t => { cachedToken = t; return t; });
    }
    return tokenPromise;
}

/** Reset cached token — called at start of each discovery run */
export function resetTokenCache(): void {
    cachedToken = undefined;
    tokenPromise = undefined;
}

async function fetchJson(url: string): Promise<any> {
    const token = await getCachedToken();
    const headers = buildAuthHeaders(token);
    const response = await fetch(url, { headers });
    if (!response.ok) {
        throw new GitHubApiError(response.status, response.statusText);
    }
    return response.json();
}

export async function fetchFileContent(repo: string, path: string): Promise<string> {
    const url = buildGitHubApiUrl(repo, path);
    const data = await fetchJson(url);
    return parseGitHubContentsResponse(data);
}

/**
 * Parse a GitHub URL like "https://github.com/owner/repo.git" into "owner/repo".
 * Returns undefined if the URL doesn't match the expected format.
 */
export function parseGitHubRepoFromUrl(url: string): string | undefined {
    const match = url.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/i);
    return match ? match[1] : undefined;
}

export interface NormalizedMarketplace {
    plugins: Array<{ name: string; description: string; version: string; source: string }>;
    /** Additional repos discovered from source.url redirect entries */
    sourceRedirectRepos: string[];
}

export function normalizeMarketplaceJson(raw: MarketplaceJson): NormalizedMarketplace {
    const entries = raw.plugins ?? raw.marketplace?.plugins ?? [];
    const plugins: NormalizedMarketplace['plugins'] = [];
    const sourceRedirectRepos: string[] = [];

    for (const p of entries) {
        if (typeof p.source === 'object' && p.source !== null && 'url' in p.source) {
            // Object-based source — extract repo from URL and add as redirect
            const repo = parseGitHubRepoFromUrl(p.source.url);
            if (repo) {
                sourceRedirectRepos.push(repo);
            }
            // Skip this plugin entry — its skills live in the redirected repo
            continue;
        }
        plugins.push({
            name: p.name,
            description: p.description,
            version: p.version,
            source: (typeof p.source === 'string' ? p.source : undefined) ?? p.path ?? './',
        });
    }

    return { plugins, sourceRedirectRepos: [...new Set(sourceRedirectRepos)] };
}

export function extractDependencies(raw: MarketplaceJson): string[] {
    const deps = raw.dependencies ?? raw.marketplace?.dependencies ?? [];
    return deps
        .map(d => d.startsWith('gh:') ? d.slice(3) : d)
        .filter(d => d.includes('/'));
}

export interface RemoteDiscoveryResult {
    plugins: PluginInfo[];
    dependencies: string[];
}

export async function discoverRemotePlugins(repo: string): Promise<RemoteDiscoveryResult> {
    const plugins: PluginInfo[] = [];
    let dependencies: string[] = [];

    let pluginEntries: Array<{ name: string; description: string; version: string; source: string; mcpField?: PluginJson['mcpServers']; mcpFieldChecked?: boolean }> = [];

    try {
        const marketplaceContent = await fetchFileContent(repo, '.claude-plugin/marketplace.json');
        const marketplace: MarketplaceJson = JSON.parse(marketplaceContent);
        const normalized = normalizeMarketplaceJson(marketplace);
        pluginEntries = normalized.plugins;
        dependencies = [
            ...extractDependencies(marketplace),
            ...normalized.sourceRedirectRepos,
        ];
    } catch (err) {
        if (err instanceof GitHubApiError && err.requiresAuth) { throw err; }
        getLogger().warn(`discoverRemotePlugins: marketplace.json fetch failed for ${repo}`, err);
        try {
            const pluginContent = await fetchFileContent(repo, '.claude-plugin/plugin.json');
            const pluginMeta: PluginJson = JSON.parse(pluginContent);
            pluginEntries = [{
                name: pluginMeta.name,
                description: pluginMeta.description,
                version: pluginMeta.version,
                source: './',
                mcpField: pluginMeta.mcpServers ?? pluginMeta.mcp_servers,
                mcpFieldChecked: true,
            }];
        } catch (err2) {
            if (err2 instanceof GitHubApiError && err2.requiresAuth) { throw err2; }
            getLogger().debug(`discoverRemotePlugins: no plugin.json found for ${repo}`, err2);
            return { plugins, dependencies: [] };
        }
    }

    for (const entry of pluginEntries) {
        const basePath = entry.source === './' ? '' : entry.source.replace(/\/$/, '') + '/';

        // Try to read plugin.json to get mcpServers config if not already checked
        if (!entry.mcpField && !entry.mcpFieldChecked) {
            try {
                const pjContent = await fetchFileContent(repo, basePath + '.claude-plugin/plugin.json');
                const pj: PluginJson = JSON.parse(pjContent);
                const mcpField = pj.mcpServers ?? pj.mcp_servers;
                if (mcpField) { entry.mcpField = mcpField; }
            } catch (err) { getLogger().debug(`discoverRemotePlugins: no plugin.json at ${basePath} for ${repo}`, err); }
        }

        const skillsPath = basePath + 'skills';

        let skillDirs: Array<{ name: string; type: string }>;
        try {
            const url = buildGitHubApiUrl(repo, skillsPath);
            skillDirs = await fetchJson(url);
        } catch (err) { getLogger().warn(`discoverRemotePlugins: failed to list skills directory for ${repo}/${skillsPath}`, err); continue; }

        const skillResults = await Promise.allSettled(
            skillDirs
                .filter(dir => dir.type === 'dir')
                .map(async (dir) => {
                    const dirPath = `${skillsPath}/${dir.name}`;
                    // Fetch SKILL.md and directory listing in parallel
                    const [skillContent, dirEntries] = await Promise.all([
                        fetchFileContent(repo, `${dirPath}/SKILL.md`),
                        fetchJson(buildGitHubApiUrl(repo, dirPath)).catch((err) => { getLogger().debug(`discoverRemotePlugins: failed to list skill dir entries for ${dirPath}`, err); return [] as Array<{ name: string; type: string }>; }),
                    ]);

                    const parsed = parseSkillFrontmatter(skillContent);

                    // Fetch companion .md files in parallel
                    const companionEntries = (dirEntries as Array<{ name: string; type: string }>)
                        .filter(e => e.type === 'file' && e.name !== 'SKILL.md' && e.name.endsWith('.md'));

                    const companionResults = await Promise.all(
                        companionEntries.map(async (e) => {
                            try {
                                const content = await fetchFileContent(repo, `${dirPath}/${e.name}`);
                                return { name: e.name, content } as CompanionFile;
                            } catch (err) { getLogger().debug(`discoverRemotePlugins: companion file fetch failed for ${dirPath}/${e.name}`, err); return null; }
                        })
                    );
                    const companionFiles = companionResults.filter((c): c is CompanionFile => c !== null);

                    return buildRemoteSkillInfo(
                        parsed.name || dir.name,
                        parsed.description,
                        skillContent,
                        entry.name,
                        entry.version,
                        repo,
                        companionFiles.length > 0 ? companionFiles : undefined,
                    );
                })
        );

        const skills = skillResults
            .filter((r): r is PromiseFulfilledResult<SkillInfo> => r.status === 'fulfilled')
            .map(r => r.value);

        // Discover MCP servers from plugin.json (inline object or path) with .mcp.json fallback
        let mcpServers: McpServerInfo[] = [];
        if (typeof entry.mcpField === 'object') {
            // Inline MCP server configs in plugin.json
            mcpServers = mcpObjectToServers(entry.mcpField, entry.name, entry.version, repo);
        } else {
            const mcpCandidates = typeof entry.mcpField === 'string'
                ? [basePath + entry.mcpField.replace(/^\.\//, ''), basePath + '.mcp.json']
                : [basePath + '.mcp.json'];
            for (const mcpPath of mcpCandidates) {
                try {
                    const mcpContent = await fetchFileContent(repo, mcpPath);
                    mcpServers = parseMcpJson(mcpContent, entry.name, entry.version, repo);
                    if (mcpServers.length > 0) { break; }
                } catch (err) {
                    getLogger().debug(`discoverRemotePlugins: MCP config not found at ${mcpPath} for ${repo}`, err);
                }
            }
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

    return { plugins, dependencies };
}

export async function fetchLatestCommitSha(repo: string): Promise<string> {
    const url = `https://api.github.com/repos/${repo}/commits?per_page=1`;
    const commits = await fetchJson(url);
    return commits[0]?.sha ?? '';
}
