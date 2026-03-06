export type SkillStatus = 'synced' | 'available' | 'update-available' | 'conflict' | 'incompatible';

export type SkillSource = 'local' | 'remote' | 'both';

export type OutputFormat = 'instructions' | 'prompts';

export interface CompanionFile {
    name: string;
    content: string;
}

export interface SkillInfo {
    name: string;
    description: string;
    content: string;
    pluginName: string;
    pluginVersion: string;
    marketplace: string;
    source: SkillSource;
    filePath?: string;
    companionFiles?: CompanionFile[];
}

export interface ClaudeMcpServerConfig {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
}

export interface McpServerInfo {
    name: string;
    config: ClaudeMcpServerConfig;
    pluginName: string;
    pluginVersion: string;
    marketplace: string;
}

export interface McpServerRecord {
    source: string;
    importedAt: string;
}

export interface PluginInfo {
    name: string;
    description: string;
    version: string;
    author?: { name: string; email?: string };
    skills: SkillInfo[];
    mcpServers?: McpServerInfo[];
    marketplace: string;
    source: SkillSource;
}

export interface MarketplaceInfo {
    name: string;
    repo: string;
    plugins: PluginInfo[];
    lastChecked?: string;
}

export interface SkillImportState {
    source: string;
    sourceHash: string;
    importedHash: string;
    importedAt: string;
    locallyModified: boolean;
    embedded?: boolean;
}

export interface BridgeManifest {
    skills: Record<string, SkillImportState>;
    mcpServers: Record<string, McpServerRecord>;
    marketplaces: Array<{ repo: string; lastChecked: string }>;
    settings: {
        checkInterval: number;
        autoAcceptUpdates: boolean;
    };
}

export interface ConversionResult {
    convertedBody: string;
    instructionsContent: string;
    promptContent: string;
    registryEntry: { name: string; file: string };
    originalContent: string;
}

export interface PluginJson {
    name: string;
    description: string;
    version: string;
    author?: { name: string; email?: string };
    skills?: string;
    agents?: string;
    commands?: string;
    hooks?: string;
    mcpServers?: string | Record<string, ClaudeMcpServerConfig>;
    // snake_case variant used by some plugins
    mcp_servers?: string | Record<string, ClaudeMcpServerConfig>;
}

export interface MarketplaceSourceUrl {
    source: string;
    url: string;
    ref?: string;
}

export interface MarketplacePluginEntry {
    name: string;
    description: string;
    version: string;
    source?: string | MarketplaceSourceUrl;
    path?: string;
    author?: { name: string; email?: string };
}

export interface MarketplaceJson {
    name?: string;
    description?: string;
    owner?: { name: string; email?: string };
    plugins?: MarketplacePluginEntry[];
    dependencies?: string[];
    // Some repos nest under a "marketplace" key
    marketplace?: {
        name?: string;
        description?: string;
        plugins?: MarketplacePluginEntry[];
        dependencies?: string[];
    };
}

export interface MarketplaceSearchResult {
    repo: string;
    description: string;
    stars: number;
    url: string;
}

export interface BulkImportResult {
    imported: string[];
    failed: Array<{ name: string; error: string }>;
}

export interface DiscoveryError {
    repo: string;
    message: string;
    requiresAuth: boolean;
}

export interface DependencyGraph {
    edges: Map<string, string[]>;
    roots: string[];
}

export interface DiscoveryResult {
    plugins: PluginInfo[];
    errors: DiscoveryError[];
    dependencyGraph: DependencyGraph;
}
