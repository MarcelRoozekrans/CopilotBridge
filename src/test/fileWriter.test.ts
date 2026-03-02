import * as assert from 'assert';
import { buildRegistryTable, mergeRegistryIntoInstructions } from '../fileWriter';

describe('buildRegistryTable', () => {
    it('should produce a markdown table from entries', () => {
        const entries = [
            { name: 'brainstorming', trigger: 'Before creative work', file: '.github/instructions/brainstorming.instructions.md' },
            { name: 'tdd', trigger: 'Before implementing', file: '.github/instructions/tdd.instructions.md' },
        ];
        const table = buildRegistryTable(entries);
        assert.ok(table.includes('| Skill | Trigger | File |'));
        assert.ok(table.includes('| brainstorming |'));
        assert.ok(table.includes('| tdd |'));
    });

    it('should return empty section for no entries', () => {
        const table = buildRegistryTable([]);
        assert.ok(table.includes('No skills imported'));
    });
});

describe('mergeRegistryIntoInstructions', () => {
    it('should append registry to empty instructions file', () => {
        const result = mergeRegistryIntoInstructions('', '## Skills\n| table |');
        assert.ok(result.includes('## Skills'));
    });

    it('should replace existing registry section', () => {
        const existing = `# Project Instructions

Some rules here.

<!-- copilot-skill-bridge:start -->
## Old Skills
old table
<!-- copilot-skill-bridge:end -->

More content.`;

        const newRegistry = '## New Skills\nnew table';
        const result = mergeRegistryIntoInstructions(existing, newRegistry);
        assert.ok(result.includes('## New Skills'));
        assert.ok(!result.includes('## Old Skills'));
        assert.ok(result.includes('Some rules here.'));
        assert.ok(result.includes('More content.'));
    });
});
