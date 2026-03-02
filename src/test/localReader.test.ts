import * as assert from 'assert';
import { resolveClaudeCachePath, parsePluginJson, buildSkillInfo } from '../localReader';
import * as os from 'os';
import * as path from 'path';

describe('resolveClaudeCachePath', () => {
    it('should expand ~ to home directory', () => {
        const result = resolveClaudeCachePath('~/.claude/plugins/cache');
        assert.ok(result.startsWith(os.homedir()));
        assert.ok(result.endsWith(path.join('.claude', 'plugins', 'cache')));
    });

    it('should return absolute paths unchanged', () => {
        const abs = '/some/absolute/path';
        assert.strictEqual(resolveClaudeCachePath(abs), abs);
    });
});

describe('parsePluginJson', () => {
    it('should parse valid plugin.json content', () => {
        const json = JSON.stringify({
            name: 'superpowers',
            description: 'Core skills',
            version: '4.3.1',
            skills: './skills/',
        });
        const result = parsePluginJson(json);
        assert.strictEqual(result.name, 'superpowers');
        assert.strictEqual(result.version, '4.3.1');
    });

    it('should throw on invalid JSON', () => {
        assert.throws(() => parsePluginJson('not json'));
    });
});

describe('buildSkillInfo', () => {
    it('should build SkillInfo from parsed data', () => {
        const result = buildSkillInfo(
            'brainstorming',
            'Use before creative work',
            '# Content',
            'superpowers',
            '4.3.1',
            'superpowers-marketplace',
            '/path/to/SKILL.md'
        );
        assert.strictEqual(result.name, 'brainstorming');
        assert.strictEqual(result.source, 'local');
        assert.strictEqual(result.pluginVersion, '4.3.1');
    });
});
