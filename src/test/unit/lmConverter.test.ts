import * as assert from 'assert';
import { buildLmPrompt, extractLmResponse, SYSTEM_PROMPT } from '../../lmConverter';

describe('buildLmPrompt', () => {
    it('should include the system prompt instructions', () => {
        assert.ok(SYSTEM_PROMPT.includes('GitHub Copilot'));
        assert.ok(SYSTEM_PROMPT.includes('Rewrite'));
    });

    it('should wrap content in a user message', () => {
        const messages = buildLmPrompt('Some skill content here');
        assert.strictEqual(messages.length, 2);
        assert.strictEqual(messages[0].role, 'system');
        assert.strictEqual(messages[1].role, 'user');
        assert.ok(messages[1].content.includes('Some skill content here'));
    });
});

describe('extractLmResponse', () => {
    it('should return the response text as-is', () => {
        const result = extractLmResponse('Rewritten content here');
        assert.strictEqual(result, 'Rewritten content here');
    });

    it('should trim whitespace from response', () => {
        const result = extractLmResponse('  content  \n');
        assert.strictEqual(result, 'content');
    });

    it('should strip markdown code fences if LM wraps output', () => {
        const result = extractLmResponse('```markdown\nthe content\n```');
        assert.strictEqual(result, 'the content');
    });

    it('should return empty string for empty response', () => {
        const result = extractLmResponse('');
        assert.strictEqual(result, '');
    });
});
