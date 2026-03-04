import * as assert from 'assert';
import { convertSkillContent, generateInstructionsFile, generatePromptFile, generateRegistryEntry, generateFullPromptFile } from '../../converter';

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

    it('should replace AskUserQuestion references', () => {
        const input = 'Use AskUserQuestion to get user preferences.';
        const result = convertSkillContent(input);
        assert.ok(!result.includes('AskUserQuestion'));
        assert.ok(result.includes('ask the user'));
    });

    it('should preserve MCP tool names as-is', () => {
        const input = 'Call search_memory with a query. Then save_memory to persist. Use update_memory to revise. Use delete_memory to remove.';
        const result = convertSkillContent(input);
        assert.ok(result.includes('search_memory'));
        assert.ok(result.includes('save_memory'));
        assert.ok(result.includes('update_memory'));
        assert.ok(result.includes('delete_memory'));
    });

    it('should replace "your human partner" jargon', () => {
        const input = 'Ask your human partner before proceeding.';
        const result = convertSkillContent(input);
        assert.ok(!result.includes('your human partner'));
        assert.ok(result.includes('the user'));
    });

    it('should replace Claude Code references', () => {
        const input = 'This is Claude Code-specific behavior. Use Claude Code to debug.';
        const result = convertSkillContent(input);
        assert.ok(!result.includes('Claude Code-specific'));
        assert.ok(!result.includes('Claude Code'));
        assert.ok(result.includes('AI assistant-specific'));
        assert.ok(result.includes('the AI assistant'));
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

    it('should rewrite superpowers: cross-references to instructions by default', () => {
        const input = 'Use superpowers:test-driven-development for TDD.';
        const result = convertSkillContent(input);
        assert.ok(result.includes('.github/instructions/test-driven-development.instructions.md'));
    });

    it('should rewrite superpowers: cross-references to prompts when prompts-only', () => {
        const input = 'Use superpowers:test-driven-development for TDD.';
        const result = convertSkillContent(input, ['prompts']);
        assert.ok(result.includes('.github/prompts/test-driven-development.prompt.md'));
        assert.ok(!result.includes('.instructions.md'));
    });

    it('should rewrite superpowers: cross-references to instructions when both formats', () => {
        const input = 'Use superpowers:brainstorming first.';
        const result = convertSkillContent(input, ['instructions', 'prompts']);
        assert.ok(result.includes('.github/instructions/brainstorming.instructions.md'));
    });

    it('should replace "For Claude:" directives', () => {
        const input = '> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans.';
        const result = convertSkillContent(input);
        assert.ok(!result.includes('For Claude:'), 'Should not contain "For Claude:"');
        assert.ok(result.includes('For the AI assistant:'));
    });

    it('should replace bare "Claude" references to the AI', () => {
        const input = 'Skills help future Claude instances find and apply effective approaches.';
        const result = convertSkillContent(input);
        assert.ok(!result.includes('Claude'), 'Should not contain bare "Claude"');
    });

    it('should replace "Claude" in phrases like "Claude reads/needs/may/will"', () => {
        const input = 'Claude reads description to decide. Claude may follow the description. Claude will take a shortcut.';
        const result = convertSkillContent(input);
        assert.ok(!result.includes('Claude'), 'Should not contain "Claude"');
    });

    it('should replace "Claude Search Optimization"', () => {
        const input = '## Claude Search Optimization (CSO)';
        const result = convertSkillContent(input);
        assert.ok(!result.includes('Claude Search Optimization'));
    });

    it('should replace "future Claude" references', () => {
        const input = 'Future Claude needs to FIND your skill. How future Claude finds your skill:';
        const result = convertSkillContent(input);
        assert.ok(!result.includes('Claude'), 'Should not contain "Claude"');
    });

    it('should not replace Claude in URLs or file paths', () => {
        const input = 'See https://claude.ai/docs for more info.';
        const result = convertSkillContent(input);
        assert.ok(result.includes('claude.ai'), 'Should preserve Claude in URLs');
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
    it('should produce a pointer to the instructions file', () => {
        const result = generatePromptFile('brainstorming', 'Creative work helper');
        assert.ok(result.startsWith('---\n'));
        assert.ok(result.includes('name: brainstorming'));
        assert.ok(result.includes('agent: agent'));
        assert.ok(result.includes('.github/instructions/brainstorming.instructions.md'));
        assert.ok(!result.includes('Body content'));
    });
});

describe('generateFullPromptFile', () => {
    it('should include full converted body in the prompt file', () => {
        const result = generateFullPromptFile('brainstorming', 'Creative work helper', 'Body content here');
        assert.ok(result.startsWith('---\n'));
        assert.ok(result.includes('name: brainstorming'));
        assert.ok(result.includes('agent: agent'));
        assert.ok(result.includes('Body content here'));
    });

    it('should not include applyTo in prompt frontmatter', () => {
        const result = generateFullPromptFile('test', 'desc', 'body');
        assert.ok(!result.includes('applyTo'));
    });

    it('should escape single quotes in description', () => {
        const result = generateFullPromptFile('test', "it's a test", 'body');
        assert.ok(result.includes("it''s a test"));
    });
});

describe('generateRegistryEntry', () => {
    it('should default to instructions path when no output formats given', () => {
        const result = generateRegistryEntry('brainstorming');
        assert.strictEqual(result.name, 'brainstorming');
        assert.strictEqual(result.file, '.github/instructions/brainstorming.instructions.md');
    });

    it('should use prompts path when output format is prompts-only', () => {
        const result = generateRegistryEntry('brainstorming', ['prompts']);
        assert.strictEqual(result.file, '.github/prompts/brainstorming.prompt.md');
    });

    it('should use instructions path when both formats are enabled', () => {
        const result = generateRegistryEntry('brainstorming', ['instructions', 'prompts']);
        assert.strictEqual(result.file, '.github/instructions/brainstorming.instructions.md');
    });

    it('should use instructions path when instructions-only', () => {
        const result = generateRegistryEntry('brainstorming', ['instructions']);
        assert.strictEqual(result.file, '.github/instructions/brainstorming.instructions.md');
    });
});
