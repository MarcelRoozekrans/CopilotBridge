import { SkillInfo, McpServerInfo, McpServerRecord } from './types';

export interface CompatResult {
    compatible: boolean;
    issues: string[];
    mcpDependencies: string[];
}

interface BlockingPattern {
    pattern: RegExp;
    reason: string;
}

const BLOCKING_PATTERNS: BlockingPattern[] = [
    { pattern: /dispatch\w*\s+\w*subtask/i, reason: 'Requires sub-agent dispatch' },
    { pattern: /spawn\w*\s+\w*agent/i, reason: 'Requires sub-agent dispatch' },
    { pattern: /parallel\s+agents?/i, reason: 'Requires parallel agent architecture' },
    { pattern: /launch\s+.*agents?\s+.*(?:independent|parallel|concurrent)/i, reason: 'Requires parallel agent architecture' },
    { pattern: /check\s+skills?\s+before\s+every\s+response/i, reason: 'Meta-orchestrator pattern (no Copilot equivalent)' },
    { pattern: /invoke.*skill.*before.*any.*response/i, reason: 'Meta-orchestrator pattern (no Copilot equivalent)' },
];

/** MCP tool patterns — not blocking, but tracked as informational dependencies */
const MCP_DEPENDENCY_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
    { pattern: /\bsearch_memory\b/, reason: 'Uses MCP memory server' },
    { pattern: /\bsave_memory\b/, reason: 'Uses MCP memory server' },
    { pattern: /\bupdate_memory\b/, reason: 'Uses MCP memory server' },
    { pattern: /\bdelete_memory\b/, reason: 'Uses MCP memory server' },
];

export function analyzeCompatibility(
    skill: SkillInfo,
    pluginMcpServers: McpServerInfo[],
    importedMcpServers: Record<string, McpServerRecord>,
    systemMcpServers: Record<string, any>,
): CompatResult {
    const issues: string[] = [];
    const mcpDependencies: string[] = [];
    const content = skill.content;

    for (const bp of BLOCKING_PATTERNS) {
        if (bp.pattern.test(content)) {
            issues.push(bp.reason);
        }
    }

    for (const dep of MCP_DEPENDENCY_PATTERNS) {
        if (dep.pattern.test(content)) {
            mcpDependencies.push(dep.reason);
        }
    }

    return {
        compatible: issues.length === 0,
        issues,
        mcpDependencies,
    };
}
