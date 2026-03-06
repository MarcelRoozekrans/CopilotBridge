import { SkillInfo, McpServerInfo, McpServerRecord } from './types';

export interface CompatResult {
    compatible: boolean;
    issues: string[];
    mcpDependencies: string[];
    skillDependencies: string[];
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
];

/** MCP tool patterns — not blocking, but tracked as informational dependencies */
const MCP_DEPENDENCY_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
    { pattern: /\bsearch_memory\b/, reason: 'Uses MCP memory server' },
    { pattern: /\bsave_memory\b/, reason: 'Uses MCP memory server' },
    { pattern: /\bupdate_memory\b/, reason: 'Uses MCP memory server' },
    { pattern: /\bdelete_memory\b/, reason: 'Uses MCP memory server' },
];

/** Patterns that extract candidate skill names from content (generic, not tied to any namespace) */
const SKILL_REF_PATTERNS: RegExp[] = [
    // namespace:skill-name cross-references (any prefix, e.g. superpowers:tdd, mytools:lint)
    /\b[\w-]+:([\w-]+)/g,
    // .github/instructions/skill-name.instructions.md file path references
    /\.github\/instructions\/([\w-]+)\.instructions\.md/g,
    // .github/prompts/skill-name.prompt.md file path references
    /\.github\/prompts\/([\w-]+)\.prompt\.md/g,
    // SUB-SKILL directives (e.g. "REQUIRED SUB-SKILL: Use skill-name")
    /(?:REQUIRED\s+)?SUB-SKILL[:\s]+(?:Use\s+)?(?:[\w-]+:)?([\w-]+)/gi,
];

/**
 * Extract candidate skill references from content.
 * Returns raw candidates — callers should filter against known skill names
 * to avoid false positives.
 */
export function extractSkillReferences(content: string): string[] {
    const refs = new Set<string>();
    for (const pattern of SKILL_REF_PATTERNS) {
        const regex = new RegExp(pattern.source, pattern.flags);
        let match;
        while ((match = regex.exec(content)) !== null) {
            refs.add(match[1]);
        }
    }
    return Array.from(refs);
}

/**
 * Extract skill dependencies by matching content references against known skill names.
 * When knownSkillNames is provided, only returns matches that exist in that set.
 * When omitted, returns all candidates (for backward compatibility / unit testing).
 */
export function extractSkillDependencies(content: string, knownSkillNames?: Set<string>): string[] {
    const refs = extractSkillReferences(content);
    if (!knownSkillNames) { return refs; }
    return refs.filter(name => knownSkillNames.has(name));
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

    const skillDependencies = extractSkillDependencies(content);

    return {
        compatible: issues.length === 0,
        issues,
        mcpDependencies,
        skillDependencies,
    };
}
