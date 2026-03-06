import * as assert from 'assert';
import { analyzeCompatibility, extractSkillDependencies, extractSkillReferences, CompatResult } from '../../compatAnalyzer';
import { SkillInfo, McpServerInfo, McpServerRecord } from '../../types';

function makeSkill(content: string, overrides: Partial<SkillInfo> = {}): SkillInfo {
    return {
        name: 'test-skill',
        description: 'test',
        content,
        pluginName: 'test-plugin',
        pluginVersion: '1.0.0',
        marketplace: 'test/repo',
        source: 'local',
        ...overrides,
    };
}

function makeMcpServer(name: string): McpServerInfo {
    return { name, config: { command: 'npx' }, pluginName: 'test', pluginVersion: '1.0.0', marketplace: 'test' };
}

describe('analyzeCompatibility', () => {
    it('should mark skill as compatible when no blocking patterns', () => {
        const skill = makeSkill('Use TDD to write tests. Follow the checklist.');
        const result = analyzeCompatibility(skill, [], {}, {});
        assert.strictEqual(result.compatible, true);
        assert.strictEqual(result.issues.length, 0);
    });

    it('should detect sub-agent dispatch pattern', () => {
        const skill = makeSkill('Dispatch a subtask for each file. Spawn agent per task.');
        const result = analyzeCompatibility(skill, [], {}, {});
        assert.strictEqual(result.compatible, false);
        assert.ok(result.issues.some(i => i.includes('sub-agent')));
    });

    it('should detect parallel agent pattern', () => {
        const skill = makeSkill('Launch parallel agents to handle independent work.');
        const result = analyzeCompatibility(skill, [], {}, {});
        assert.strictEqual(result.compatible, false);
    });

    it('should treat AskUserQuestion as compatible (converted, not blocked)', () => {
        const skill = makeSkill('Use AskUserQuestion to get user preference.');
        const result = analyzeCompatibility(skill, [], {}, {});
        assert.strictEqual(result.compatible, true);
        assert.strictEqual(result.issues.length, 0);
    });

    it('should allow meta-orchestrator pattern (copilot-instructions.md serves this role)', () => {
        const skill = makeSkill('Check skills before every response. Invoke skill before any response.');
        const result = analyzeCompatibility(skill, [], {}, {});
        assert.strictEqual(result.compatible, true);
        assert.strictEqual(result.issues.length, 0);
    });

    it('should track memory tools as informational dependencies without blocking', () => {
        const skill = makeSkill('Use search_memory to find previous context. Use save_memory to store.');
        const result = analyzeCompatibility(skill, [], {}, {});
        assert.strictEqual(result.compatible, true);
        assert.strictEqual(result.issues.length, 0);
        assert.ok(result.mcpDependencies.length > 0);
    });

    it('should track update_memory and delete_memory as dependencies', () => {
        const skill = makeSkill('Use update_memory to revise. Use delete_memory to remove.');
        const result = analyzeCompatibility(skill, [], {}, {});
        assert.strictEqual(result.compatible, true);
        assert.strictEqual(result.mcpDependencies.length, 2);
    });

    it('should remain incompatible only for sub-agent pattern even with memory tools', () => {
        const skill = makeSkill('Dispatch subtask. Use search_memory.');
        const result = analyzeCompatibility(skill, [], {}, {});
        assert.strictEqual(result.compatible, false);
        assert.ok(result.issues.some(i => i.includes('sub-agent')));
        assert.ok(result.mcpDependencies.length > 0);
    });

    it('should handle multiple blocking patterns', () => {
        const skill = makeSkill('Dispatch subtask agents. Launch parallel agents concurrently.');
        const result = analyzeCompatibility(skill, [], {}, {});
        assert.strictEqual(result.compatible, false);
        assert.ok(result.issues.length >= 2);
    });

    it('should extract skill dependencies from superpowers: references', () => {
        const skill = makeSkill('Use superpowers:test-driven-development for TDD. Also superpowers:brainstorming.');
        const result = analyzeCompatibility(skill, [], {}, {});
        assert.deepStrictEqual(result.skillDependencies, ['test-driven-development', 'brainstorming']);
    });

    it('should return empty skill dependencies when no references', () => {
        const skill = makeSkill('Simple skill with no cross-references.');
        const result = analyzeCompatibility(skill, [], {}, {});
        assert.strictEqual(result.skillDependencies.length, 0);
    });
});

describe('extractSkillReferences', () => {
    it('should extract from any namespace:skill-name pattern', () => {
        const result = extractSkillReferences('Use superpowers:tdd and mytools:lint-check.');
        assert.ok(result.includes('tdd'));
        assert.ok(result.includes('lint-check'));
    });

    it('should deduplicate repeated references', () => {
        const result = extractSkillReferences('superpowers:tdd twice: superpowers:tdd');
        assert.strictEqual(result.filter(d => d === 'tdd').length, 1);
    });

    it('should return empty array for no references', () => {
        const result = extractSkillReferences('No skill references here.');
        assert.deepStrictEqual(result, []);
    });

    it('should handle hyphenated skill names', () => {
        const result = extractSkillReferences('superpowers:test-driven-development');
        assert.ok(result.includes('test-driven-development'));
    });

    it('should extract from .github/instructions/ file paths', () => {
        const result = extractSkillReferences('See .github/instructions/brainstorming.instructions.md for details.');
        assert.ok(result.includes('brainstorming'));
    });

    it('should extract from .github/prompts/ file paths', () => {
        const result = extractSkillReferences('Run .github/prompts/tdd.prompt.md');
        assert.ok(result.includes('tdd'));
    });

    it('should extract from REQUIRED SUB-SKILL patterns', () => {
        const result = extractSkillReferences('REQUIRED SUB-SKILL: Use executing-plans to implement.');
        assert.ok(result.includes('executing-plans'));
    });

    it('should extract from SUB-SKILL with any namespace prefix', () => {
        const result = extractSkillReferences('SUB-SKILL: Use mytools:finishing-a-branch');
        assert.ok(result.includes('finishing-a-branch'));
    });

    it('should deduplicate across different reference styles', () => {
        const result = extractSkillReferences(
            'Use superpowers:tdd. See .github/instructions/tdd.instructions.md.'
        );
        assert.strictEqual(result.filter(d => d === 'tdd').length, 1);
    });
});

describe('extractSkillDependencies', () => {
    it('should return all candidates when no known names provided', () => {
        const result = extractSkillDependencies('Use superpowers:tdd and superpowers:brainstorming.');
        assert.ok(result.includes('tdd'));
        assert.ok(result.includes('brainstorming'));
    });

    it('should filter against known skill names when provided', () => {
        const known = new Set(['tdd']);
        const result = extractSkillDependencies('Use superpowers:tdd and superpowers:unknown-skill.', known);
        assert.deepStrictEqual(result, ['tdd']);
    });

    it('should return empty when no candidates match known names', () => {
        const known = new Set(['other']);
        const result = extractSkillDependencies('Use superpowers:tdd.', known);
        assert.deepStrictEqual(result, []);
    });

    it('should work with any namespace prefix when filtering', () => {
        const known = new Set(['lint-check', 'brainstorming']);
        const result = extractSkillDependencies('Use mytools:lint-check and vendor:brainstorming.', known);
        assert.ok(result.includes('lint-check'));
        assert.ok(result.includes('brainstorming'));
    });
});
