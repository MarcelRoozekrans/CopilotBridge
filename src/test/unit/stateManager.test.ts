import * as assert from 'assert';
import { createEmptyManifest, computeHash, isSkillImported, isSkillOutdated, recordImport, removeSkillRecord } from '../../stateManager';
import { BridgeManifest } from '../../types';

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

    it('should return false for unknown skill', () => {
        const m = createEmptyManifest();
        assert.strictEqual(isSkillOutdated(m, 'unknown', 'abc'), false);
    });
});

describe('recordImport', () => {
    it('should add a new skill to the manifest', () => {
        const m = createEmptyManifest();
        const updated = recordImport(m, 'brainstorming', 'superpowers@sp', 'hash123');
        assert.ok(updated.skills['brainstorming']);
        assert.strictEqual(updated.skills['brainstorming'].source, 'superpowers@sp');
        assert.strictEqual(updated.skills['brainstorming'].sourceHash, 'hash123');
        assert.strictEqual(updated.skills['brainstorming'].importedHash, 'hash123');
        assert.strictEqual(updated.skills['brainstorming'].locallyModified, false);
    });

    it('should not mutate the original manifest', () => {
        const m = createEmptyManifest();
        const updated = recordImport(m, 'brainstorming', 'src', 'h');
        assert.deepStrictEqual(m.skills, {});
        assert.ok(updated.skills['brainstorming']);
    });

    it('should overwrite an existing skill entry', () => {
        let m = createEmptyManifest();
        m = recordImport(m, 'brainstorming', 'old-source', 'old-hash');
        m = recordImport(m, 'brainstorming', 'new-source', 'new-hash');
        assert.strictEqual(m.skills['brainstorming'].source, 'new-source');
        assert.strictEqual(m.skills['brainstorming'].importedHash, 'new-hash');
    });
});

describe('removeSkillRecord', () => {
    it('should remove an existing skill from the manifest', () => {
        let m = createEmptyManifest();
        m = recordImport(m, 'brainstorming', 'src', 'hash');
        m = recordImport(m, 'tdd', 'src', 'hash2');
        const updated = removeSkillRecord(m, 'brainstorming');
        assert.strictEqual(updated.skills['brainstorming'], undefined);
        assert.ok(updated.skills['tdd']);
    });

    it('should return manifest unchanged if skill does not exist', () => {
        const m = createEmptyManifest();
        const updated = removeSkillRecord(m, 'nonexistent');
        assert.deepStrictEqual(updated.skills, {});
    });

    it('should not mutate the original manifest', () => {
        let m = createEmptyManifest();
        m = recordImport(m, 'brainstorming', 'src', 'hash');
        const updated = removeSkillRecord(m, 'brainstorming');
        assert.ok(m.skills['brainstorming']);
        assert.strictEqual(updated.skills['brainstorming'], undefined);
    });
});
