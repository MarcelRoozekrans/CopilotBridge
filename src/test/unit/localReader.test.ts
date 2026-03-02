import * as assert from 'assert';
import { resolveClaudeCachePath, parsePluginJson, buildSkillInfo, parseMcpJson } from '../../localReader';
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

describe('parseMcpJson', () => {
    it('should parse a valid .mcp.json into McpServerInfo array', () => {
        const raw = JSON.stringify({
            'context7': { command: 'npx', args: ['-y', '@context7/mcp'] },
            'playwright': { command: 'npx', args: ['-y', '@playwright/mcp'] },
        });
        const servers = parseMcpJson(raw, 'superpowers', '4.3.1', 'superpowers-marketplace');
        assert.strictEqual(servers.length, 2);
        assert.strictEqual(servers[0].name, 'context7');
        assert.strictEqual(servers[0].config.command, 'npx');
        assert.strictEqual(servers[0].pluginName, 'superpowers');
    });

    it('should parse HTTP server configs', () => {
        const raw = JSON.stringify({
            'remote': { url: 'https://mcp.example.com/sse' },
        });
        const servers = parseMcpJson(raw, 'test', '1.0.0', 'test');
        assert.strictEqual(servers[0].config.url, 'https://mcp.example.com/sse');
    });

    it('should return empty array for invalid JSON', () => {
        const servers = parseMcpJson('not valid json', 'test', '1.0.0', 'test');
        assert.deepStrictEqual(servers, []);
    });

    it('should return empty array for empty object', () => {
        const servers = parseMcpJson('{}', 'test', '1.0.0', 'test');
        assert.deepStrictEqual(servers, []);
    });
});
