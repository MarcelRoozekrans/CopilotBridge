import { SkillInfo, McpServerInfo, McpServerRecord } from './types';

export interface CompatResult {
    compatible: boolean;
    issues: string[];
    mcpDependencies: string[];
}

interface BlockingPattern {
    pattern: RegExp;
    reason: string;
    mcpResolvable: boolean;
}

const BLOCKING_PATTERNS: BlockingPattern[] = [
    { pattern: /dispatch\w*\s+\w*subtask/i, reason: 'Requires sub-agent dispatch', mcpResolvable: false },
    { pattern: /spawn\w*\s+\w*agent/i, reason: 'Requires sub-agent dispatch', mcpResolvable: false },
    { pattern: /parallel\s+agents?/i, reason: 'Requires parallel agent architecture', mcpResolvable: false },
    { pattern: /launch\s+.*agents?\s+.*(?:independent|parallel|concurrent)/i, reason: 'Requires parallel agent architecture', mcpResolvable: false },
    { pattern: /check\s+skills?\s+before\s+every\s+response/i, reason: 'Meta-orchestrator pattern (no Copilot equivalent)', mcpResolvable: false },
    { pattern: /invoke.*skill.*before.*any.*response/i, reason: 'Meta-orchestrator pattern (no Copilot equivalent)', mcpResolvable: false },
    { pattern: /\bsearch_memory\b/, reason: 'Requires MCP memory server', mcpResolvable: true },
    { pattern: /\bsave_memory\b/, reason: 'Requires MCP memory server', mcpResolvable: true },
];

function hasMcpServerAvailable(
    pluginMcpServers: McpServerInfo[],
    importedMcpServers: Record<string, McpServerRecord>,
    systemMcpServers: Record<string, any>,
): boolean {
    if (pluginMcpServers.length > 0) { return true; }
    if (Object.keys(importedMcpServers).length > 0) { return true; }
    if (Object.keys(systemMcpServers).length > 0) { return true; }
    return false;
}

export function analyzeCompatibility(
    skill: SkillInfo,
    pluginMcpServers: McpServerInfo[],
    importedMcpServers: Record<string, McpServerRecord>,
    systemMcpServers: Record<string, any>,
): CompatResult {
    const issues: string[] = [];
    const mcpDependencies: string[] = [];
    const content = skill.content;

    const mcpAvailable = hasMcpServerAvailable(pluginMcpServers, importedMcpServers, systemMcpServers);

    for (const bp of BLOCKING_PATTERNS) {
        if (!bp.pattern.test(content)) { continue; }

        if (bp.mcpResolvable) {
            mcpDependencies.push(bp.reason);
            if (!mcpAvailable) {
                issues.push(bp.reason);
            }
        } else {
            issues.push(bp.reason);
        }
    }

    return {
        compatible: issues.length === 0,
        issues,
        mcpDependencies,
    };
}
