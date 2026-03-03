import * as assert from 'assert';
import { analyzeCompatibility, CompatResult } from '../../compatAnalyzer';
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

    it('should detect meta-orchestrator pattern', () => {
        const skill = makeSkill('Check skills before every response. Invoke skill before any response.');
        const result = analyzeCompatibility(skill, [], {}, {});
        assert.strictEqual(result.compatible, false);
        assert.ok(result.issues.some(i => i.includes('Meta-orchestrator')));
    });

    it('should detect memory tool dependency', () => {
        const skill = makeSkill('Use search_memory to find previous context. Use save_memory to store.');
        const result = analyzeCompatibility(skill, [], {}, {});
        assert.strictEqual(result.compatible, false);
        assert.ok(result.mcpDependencies.length > 0);
    });

    it('should resolve memory dependency when plugin has MCP server', () => {
        const skill = makeSkill('Use search_memory to find context.');
        const pluginMcp = [makeMcpServer('memory-server')];
        const result = analyzeCompatibility(skill, pluginMcp, {}, {});
        assert.strictEqual(result.compatible, true);
        assert.strictEqual(result.issues.length, 0);
    });

    it('should resolve memory dependency when MCP server already imported', () => {
        const skill = makeSkill('Use save_memory to store context.');
        const imported: Record<string, McpServerRecord> = {
            'memory-server': { source: 'test@test', importedAt: '2026-01-01' },
        };
        const result = analyzeCompatibility(skill, [], imported, {});
        assert.strictEqual(result.compatible, true);
    });

    it('should resolve memory dependency when system MCP server exists', () => {
        const skill = makeSkill('Use search_memory to recall.');
        const systemServers = { 'my-memory': { command: 'npx', args: ['-y', 'memory-server'] } };
        const result = analyzeCompatibility(skill, [], {}, systemServers);
        assert.strictEqual(result.compatible, true);
    });

    it('should remain incompatible when sub-agent + unresolved MCP', () => {
        const skill = makeSkill('Dispatch subtask. Use search_memory.');
        const result = analyzeCompatibility(skill, [], {}, {});
        assert.strictEqual(result.compatible, false);
        assert.ok(result.issues.length >= 1);
    });

    it('should handle multiple blocking patterns', () => {
        const skill = makeSkill('Dispatch subtask. Check skills before every response.');
        const result = analyzeCompatibility(skill, [], {}, {});
        assert.strictEqual(result.compatible, false);
        assert.ok(result.issues.length >= 2);
    });
});
