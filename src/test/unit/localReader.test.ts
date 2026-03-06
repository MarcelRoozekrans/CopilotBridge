import * as assert from 'assert';
import { resolveClaudeCachePath, parsePluginJson, buildSkillInfo, parseMcpJson, mcpObjectToServers } from '../../localReader';
import { CompanionFile } from '../../types';
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

    it('should parse mcpServers path from plugin.json', () => {
        const json = JSON.stringify({
            name: 'longterm-memory',
            description: 'Memory plugin',
            version: '1.0.0',
            skills: './skills/',
            mcpServers: './.mcp.json',
        });
        const result = parsePluginJson(json);
        assert.strictEqual(result.mcpServers, './.mcp.json');
    });

    it('should handle plugin.json without mcpServers field', () => {
        const json = JSON.stringify({
            name: 'superpowers',
            description: 'Core skills',
            version: '4.3.1',
        });
        const result = parsePluginJson(json);
        assert.strictEqual(result.mcpServers, undefined);
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

describe('buildSkillInfo with companion files', () => {
    it('should include companionFiles when provided', () => {
        const companions: CompanionFile[] = [
            { name: 'visual-criteria.md', content: '# Criteria' },
        ];
        const result = buildSkillInfo(
            'regression-test', 'desc', '# SKILL', 'plugin', '1.0.0', 'market', '/path',
            companions
        );
        assert.strictEqual(result.companionFiles?.length, 1);
        assert.strictEqual(result.companionFiles![0].name, 'visual-criteria.md');
    });

    it('should have undefined companionFiles when not provided', () => {
        const result = buildSkillInfo(
            'simple', 'desc', '# SKILL', 'plugin', '1.0.0', 'market', '/path'
        );
        assert.strictEqual(result.companionFiles, undefined);
    });

    it('should have undefined companionFiles when empty array provided', () => {
        const result = buildSkillInfo(
            'simple', 'desc', '# SKILL', 'plugin', '1.0.0', 'market', '/path',
            []
        );
        assert.strictEqual(result.companionFiles, undefined);
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

describe('mcpObjectToServers', () => {
    it('should convert inline MCP server config object', () => {
        const obj = {
            chrome: { command: 'node', args: ['dist/index.js'] },
            memory: { command: 'npx', args: ['-y', 'memory-server'] },
        };
        const servers = mcpObjectToServers(obj, 'my-plugin', '1.0.0', 'test-marketplace');
        assert.strictEqual(servers.length, 2);
        assert.strictEqual(servers[0].name, 'chrome');
        assert.strictEqual(servers[0].config.command, 'node');
        assert.strictEqual(servers[0].pluginName, 'my-plugin');
        assert.strictEqual(servers[1].name, 'memory');
    });

    it('should return empty array for null', () => {
        assert.deepStrictEqual(mcpObjectToServers(null, 'p', '1', 'm'), []);
    });

    it('should return empty array for array input', () => {
        assert.deepStrictEqual(mcpObjectToServers([], 'p', '1', 'm'), []);
    });

    it('should return empty array for non-object', () => {
        assert.deepStrictEqual(mcpObjectToServers('string', 'p', '1', 'm'), []);
    });
});

describe('parsePluginJson mcpServers formats', () => {
    it('should parse inline mcpServers object from plugin.json', () => {
        const json = JSON.stringify({
            name: 'chrome-plugin',
            description: 'Chrome automation',
            version: '1.6.1',
            mcpServers: {
                chrome: { command: 'node', args: ['mcp/dist/index.js'] },
            },
        });
        const result = parsePluginJson(json);
        assert.strictEqual(typeof result.mcpServers, 'object');
        assert.ok(!Array.isArray(result.mcpServers));
        const servers = mcpObjectToServers(result.mcpServers, result.name, result.version, 'test');
        assert.strictEqual(servers.length, 1);
        assert.strictEqual(servers[0].name, 'chrome');
    });

    it('should parse string mcpServers path from plugin.json', () => {
        const json = JSON.stringify({
            name: 'longterm-memory',
            description: 'Memory plugin',
            version: '1.0.0',
            mcpServers: './.mcp.json',
        });
        const result = parsePluginJson(json);
        assert.strictEqual(typeof result.mcpServers, 'string');
        assert.strictEqual(result.mcpServers, './.mcp.json');
    });
});
