import * as assert from 'assert';
import { convertSkillContent, generateInstructionsFile, generatePromptFile, generateRegistryEntry } from '../converter';

describe('convertSkillContent', () => {
    it('should replace TodoWrite references', () => {
        const input = 'Use the TodoWrite tool to track tasks.';
        const result = convertSkillContent(input);
        assert.ok(!result.includes('TodoWrite'));
        assert.ok(result.includes('checklist'));
    });

    it('should replace Agent/subagent references', () => {
        const input = 'Use the Agent tool to dispatch subagents for parallel work.';
        const result = convertSkillContent(input);
        assert.ok(!result.includes('Agent tool'));
        assert.ok(!result.includes('subagents'));
    });

    it('should replace Skill tool invocations', () => {
        const input = 'Invoke the Skill tool with superpowers:brainstorming.';
        const result = convertSkillContent(input);
        assert.ok(!result.includes('Skill tool'));
        assert.ok(result.includes('.github/instructions/'));
    });

    it('should replace file operation tool refs', () => {
        const input = 'Use the Read tool to read the file. Then use Grep to search.';
        const result = convertSkillContent(input);
        assert.ok(!result.includes('Read tool'));
        assert.ok(!result.includes('Grep'));
    });

    it('should replace EnterPlanMode/ExitPlanMode', () => {
        const input = 'Call EnterPlanMode to start planning. Then ExitPlanMode when done.';
        const result = convertSkillContent(input);
        assert.ok(!result.includes('EnterPlanMode'));
        assert.ok(!result.includes('ExitPlanMode'));
    });

    it('should replace CLAUDE.md references', () => {
        const input = 'Check the CLAUDE.md for project instructions.';
        const result = convertSkillContent(input);
        assert.ok(!result.includes('CLAUDE.md'));
        assert.ok(result.includes('copilot-instructions.md'));
    });

    it('should remove ~/.claude/ paths', () => {
        const input = 'Found at ~/.claude/plugins/cache/foo.';
        const result = convertSkillContent(input);
        assert.ok(!result.includes('~/.claude/'));
    });

    it('should rewrite superpowers: skill cross-references', () => {
        const input = 'Use superpowers:test-driven-development for TDD.';
        const result = convertSkillContent(input);
        assert.ok(result.includes('.github/instructions/test-driven-development.instructions.md'));
    });

    it('should preserve graphviz diagrams', () => {
        const input = '```dot\ndigraph { A -> B; }\n```';
        const result = convertSkillContent(input);
        assert.ok(result.includes('digraph'));
    });

    it('should preserve checklists', () => {
        const input = '- [ ] Do this\n- [x] Done that';
        const result = convertSkillContent(input);
        assert.strictEqual(result, input);
    });
});

describe('generateInstructionsFile', () => {
    it('should produce valid instructions markdown with frontmatter', () => {
        const result = generateInstructionsFile('brainstorming', 'Creative work helper', 'Body content');
        assert.ok(result.startsWith('---\n'));
        assert.ok(result.includes("name: 'Brainstorming'"));
        assert.ok(result.includes('applyTo:'));
        assert.ok(result.includes('Body content'));
    });
});

describe('generatePromptFile', () => {
    it('should produce valid prompt markdown with frontmatter', () => {
        const result = generatePromptFile('brainstorming', 'Creative work helper', 'Body content');
        assert.ok(result.startsWith('---\n'));
        assert.ok(result.includes('name: brainstorming'));
        assert.ok(result.includes('agent: agent'));
        assert.ok(result.includes('Body content'));
    });
});

describe('generateRegistryEntry', () => {
    it('should return registry table row data', () => {
        const result = generateRegistryEntry('brainstorming', 'Use before creative work');
        assert.strictEqual(result.name, 'brainstorming');
        assert.strictEqual(result.trigger, 'Use before creative work');
        assert.ok(result.file.includes('brainstorming.instructions.md'));
    });
});
