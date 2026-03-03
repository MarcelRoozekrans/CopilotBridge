export type SkillStatus = 'synced' | 'available' | 'update-available' | 'conflict' | 'incompatible';

export type SkillSource = 'local' | 'remote' | 'both';

export type OutputFormat = 'instructions' | 'prompts';

export interface SkillInfo {
    name: string;
    description: string;
    content: string;
    pluginName: string;
    pluginVersion: string;
    marketplace: string;
    source: SkillSource;
    filePath?: string;
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
    registryEntry: { name: string; trigger: string; file: string };
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
}

export interface MarketplacePluginEntry {
    name: string;
    description: string;
    version: string;
    source?: string;
    path?: string;
    author?: { name: string; email?: string };
}

export interface MarketplaceJson {
    name?: string;
    description?: string;
    owner?: { name: string; email?: string };
    plugins?: MarketplacePluginEntry[];
    // Some repos nest under a "marketplace" key
    marketplace?: {
        name?: string;
        description?: string;
        plugins?: MarketplacePluginEntry[];
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
