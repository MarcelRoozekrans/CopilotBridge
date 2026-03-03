import * as assert from 'assert';
import { createEmptyManifest, computeHash, isSkillImported, isSkillOutdated, recordImport, removeSkillRecord, isMcpServerImported, recordMcpImport, removeMcpRecord, setSkillEmbedded, isSkillEmbedded } from '../../stateManager';
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

describe('isMcpServerImported', () => {
    it('should return true if MCP server exists in manifest', () => {
        const m = createEmptyManifest();
        m.mcpServers = { 'context7': { source: 'superpowers@sp', importedAt: '2026-01-01' } };
        assert.strictEqual(isMcpServerImported(m, 'context7'), true);
    });

    it('should return false for unknown MCP server', () => {
        const m = createEmptyManifest();
        assert.strictEqual(isMcpServerImported(m, 'unknown'), false);
    });
});

describe('recordMcpImport', () => {
    it('should add MCP server to manifest', () => {
        const m = createEmptyManifest();
        const updated = recordMcpImport(m, 'context7', 'superpowers@sp');
        assert.ok(updated.mcpServers['context7']);
        assert.strictEqual(updated.mcpServers['context7'].source, 'superpowers@sp');
        assert.ok(updated.mcpServers['context7'].importedAt);
    });

    it('should not mutate original manifest', () => {
        const m = createEmptyManifest();
        const updated = recordMcpImport(m, 'context7', 'src');
        assert.deepStrictEqual(m.mcpServers, {});
        assert.ok(updated.mcpServers['context7']);
    });
});

describe('removeMcpRecord', () => {
    it('should remove MCP server from manifest', () => {
        let m = createEmptyManifest();
        m = recordMcpImport(m, 'context7', 'src');
        m = recordMcpImport(m, 'playwright', 'src');
        const updated = removeMcpRecord(m, 'context7');
        assert.strictEqual(updated.mcpServers['context7'], undefined);
        assert.ok(updated.mcpServers['playwright']);
    });

    it('should not mutate original manifest', () => {
        let m = createEmptyManifest();
        m = recordMcpImport(m, 'context7', 'src');
        const updated = removeMcpRecord(m, 'context7');
        assert.ok(m.mcpServers['context7']);
        assert.strictEqual(updated.mcpServers['context7'], undefined);
    });
});

describe('setSkillEmbedded', () => {
    it('should set embedded flag on an existing skill', () => {
        let m = createEmptyManifest();
        m = recordImport(m, 'memory', 'src', 'hash');
        const updated = setSkillEmbedded(m, 'memory', true);
        assert.strictEqual(updated.skills['memory'].embedded, true);
    });

    it('should clear embedded flag', () => {
        let m = createEmptyManifest();
        m = recordImport(m, 'memory', 'src', 'hash');
        m = setSkillEmbedded(m, 'memory', true);
        const updated = setSkillEmbedded(m, 'memory', false);
        assert.strictEqual(updated.skills['memory'].embedded, false);
    });

    it('should return manifest unchanged for non-existent skill', () => {
        const m = createEmptyManifest();
        const updated = setSkillEmbedded(m, 'nonexistent', true);
        assert.deepStrictEqual(updated, m);
    });

    it('should not mutate original manifest', () => {
        let m = createEmptyManifest();
        m = recordImport(m, 'memory', 'src', 'hash');
        const updated = setSkillEmbedded(m, 'memory', true);
        assert.strictEqual(m.skills['memory'].embedded, false);
        assert.strictEqual(updated.skills['memory'].embedded, true);
    });
});

describe('isSkillEmbedded', () => {
    it('should return true for embedded skill', () => {
        let m = createEmptyManifest();
        m = recordImport(m, 'memory', 'src', 'hash');
        m = setSkillEmbedded(m, 'memory', true);
        assert.strictEqual(isSkillEmbedded(m, 'memory'), true);
    });

    it('should return false for non-embedded skill', () => {
        let m = createEmptyManifest();
        m = recordImport(m, 'memory', 'src', 'hash');
        assert.strictEqual(isSkillEmbedded(m, 'memory'), false);
    });

    it('should return false for non-existent skill', () => {
        const m = createEmptyManifest();
        assert.strictEqual(isSkillEmbedded(m, 'unknown'), false);
    });
});

describe('recordImport preserves embedded', () => {
    it('should preserve embedded flag on re-import', () => {
        let m = createEmptyManifest();
        m = recordImport(m, 'memory', 'src', 'hash1');
        m = setSkillEmbedded(m, 'memory', true);
        m = recordImport(m, 'memory', 'src', 'hash2');
        assert.strictEqual(m.skills['memory'].embedded, true);
        assert.strictEqual(m.skills['memory'].importedHash, 'hash2');
    });

    it('should default embedded to false for new imports', () => {
        const m = createEmptyManifest();
        const updated = recordImport(m, 'new-skill', 'src', 'hash');
        assert.strictEqual(updated.skills['new-skill'].embedded, false);
    });
});
