import * as assert from 'assert';
import { parseSkillFrontmatter } from '../parser';

describe('parseSkillFrontmatter', () => {
    it('should parse YAML frontmatter from SKILL.md content', () => {
        const content = `---
name: brainstorming
description: Use when starting creative work
---

# Brainstorming

Content here.`;

        const result = parseSkillFrontmatter(content);
        assert.strictEqual(result.name, 'brainstorming');
        assert.strictEqual(result.description, 'Use when starting creative work');
        assert.strictEqual(result.body.trim(), '# Brainstorming\n\nContent here.');
    });

    it('should handle content without frontmatter', () => {
        const content = '# Just Content\n\nNo frontmatter here.';
        const result = parseSkillFrontmatter(content);
        assert.strictEqual(result.name, '');
        assert.strictEqual(result.description, '');
        assert.strictEqual(result.body, content);
    });

    it('should handle empty description', () => {
        const content = `---
name: my-skill
description:
---

Body text.`;
        const result = parseSkillFrontmatter(content);
        assert.strictEqual(result.name, 'my-skill');
        assert.strictEqual(result.description, '');
    });
});
