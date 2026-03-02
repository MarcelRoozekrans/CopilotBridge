import * as assert from 'assert';
import { createEmptyManifest, computeHash, isSkillImported, isSkillOutdated } from '../stateManager';
import { BridgeManifest } from '../types';

describe('createEmptyManifest', () => {
    it('should return a valid empty manifest', () => {
        const m = createEmptyManifest();
        assert.deepStrictEqual(m.skills, {});
        assert.deepStrictEqual(m.marketplaces, []);
        assert.strictEqual(m.settings.checkInterval, 86400);
    });
});

describe('computeHash', () => {
    it('should return consistent hash for same content', () => {
        const h1 = computeHash('hello world');
        const h2 = computeHash('hello world');
        assert.strictEqual(h1, h2);
    });

    it('should return different hash for different content', () => {
        const h1 = computeHash('hello');
        const h2 = computeHash('world');
        assert.notStrictEqual(h1, h2);
    });
});

describe('isSkillImported', () => {
    it('should return true if skill exists in manifest', () => {
        const m = createEmptyManifest();
        m.skills['brainstorming'] = {
            source: 'superpowers@superpowers-marketplace',
            sourceHash: 'abc',
            importedHash: 'abc',
            importedAt: '2026-01-01',
            locallyModified: false,
        };
        assert.strictEqual(isSkillImported(m, 'brainstorming'), true);
    });

    it('should return false for unknown skills', () => {
        const m = createEmptyManifest();
        assert.strictEqual(isSkillImported(m, 'unknown'), false);
    });
});

describe('isSkillOutdated', () => {
    it('should return true if source hash differs from imported hash', () => {
        const m = createEmptyManifest();
        m.skills['brainstorming'] = {
            source: 'test',
            sourceHash: 'new-hash',
            importedHash: 'old-hash',
            importedAt: '2026-01-01',
            locallyModified: false,
        };
        assert.strictEqual(isSkillOutdated(m, 'brainstorming', 'new-hash'), true);
    });

    it('should return false if hashes match', () => {
        const m = createEmptyManifest();
        m.skills['brainstorming'] = {
            source: 'test',
            sourceHash: 'same',
            importedHash: 'same',
            importedAt: '2026-01-01',
            locallyModified: false,
        };
        assert.strictEqual(isSkillOutdated(m, 'brainstorming', 'same'), false);
    });
});
