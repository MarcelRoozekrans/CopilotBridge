import * as assert from 'assert';
import { SkillStatus, SkillInfo, PluginInfo, MarketplaceInfo, SkillImportState, BridgeManifest, McpServerInfo, ClaudeMcpServerConfig, McpServerRecord } from '../../types';

describe('Types', () => {
    it('should create a valid SkillInfo', () => {
        const skill: SkillInfo = {
            name: 'brainstorming',
            description: 'Use when starting creative work',
            content: '# Brainstorming\n\nContent here',
            pluginName: 'superpowers',
            pluginVersion: '4.3.1',
            marketplace: 'superpowers-marketplace',
            source: 'local',
            filePath: '/home/user/.claude/plugins/cache/superpowers-marketplace/superpowers/4.3.1/skills/brainstorming/SKILL.md',
        };
        assert.strictEqual(skill.name, 'brainstorming');
        assert.strictEqual(skill.source, 'local');
    });

    it('should create a valid BridgeManifest', () => {
        const manifest: BridgeManifest = {
            skills: {},
            mcpServers: {},
            marketplaces: [],
            settings: {
                checkInterval: 86400,
                autoAcceptUpdates: false,
            },
        };
        assert.deepStrictEqual(manifest.skills, {});
        assert.strictEqual(manifest.settings.checkInterval, 86400);
    });

    it('should create McpServerInfo with stdio config', () => {
        const server: McpServerInfo = {
            name: 'my-mcp-server',
            config: {
                command: 'node',
                args: ['server.js', '--port', '3000'],
                env: { NODE_ENV: 'production' },
            },
            pluginName: 'superpowers',
            pluginVersion: '4.3.1',
            marketplace: 'superpowers-marketplace',
        };
        assert.strictEqual(server.name, 'my-mcp-server');
        assert.strictEqual(server.config.command, 'node');
        assert.deepStrictEqual(server.config.args, ['server.js', '--port', '3000']);
        assert.strictEqual(server.config.env!['NODE_ENV'], 'production');
        assert.strictEqual(server.config.url, undefined);
    });

    it('should create McpServerInfo with http config', () => {
        const server: McpServerInfo = {
            name: 'remote-mcp',
            config: {
                url: 'https://mcp.example.com/sse',
            },
            pluginName: 'remote-tools',
            pluginVersion: '1.0.0',
            marketplace: 'community-marketplace',
        };
        assert.strictEqual(server.name, 'remote-mcp');
        assert.strictEqual(server.config.url, 'https://mcp.example.com/sse');
        assert.strictEqual(server.config.command, undefined);
        assert.strictEqual(server.config.args, undefined);
    });

    it('should accept mcpServers field in BridgeManifest', () => {
        const manifest: BridgeManifest = {
            skills: {},
            mcpServers: {
                'my-mcp-server': {
                    source: 'superpowers@superpowers-marketplace',
                    importedAt: '2026-03-01T00:00:00.000Z',
                },
            },
            marketplaces: [],
            settings: {
                checkInterval: 86400,
                autoAcceptUpdates: false,
            },
        };
        assert.ok(manifest.mcpServers['my-mcp-server']);
        assert.strictEqual(manifest.mcpServers['my-mcp-server'].source, 'superpowers@superpowers-marketplace');
        assert.strictEqual(manifest.mcpServers['my-mcp-server'].importedAt, '2026-03-01T00:00:00.000Z');
    });

    it('should accept mcpServers array in PluginInfo', () => {
        const plugin: PluginInfo = {
            name: 'superpowers',
            description: 'A plugin with MCP servers',
            version: '4.3.1',
            skills: [],
            mcpServers: [
                {
                    name: 'my-mcp-server',
                    config: {
                        command: 'node',
                        args: ['server.js'],
                    },
                    pluginName: 'superpowers',
                    pluginVersion: '4.3.1',
                    marketplace: 'superpowers-marketplace',
                },
            ],
            marketplace: 'superpowers-marketplace',
            source: 'remote',
        };
        assert.strictEqual(plugin.mcpServers!.length, 1);
        assert.strictEqual(plugin.mcpServers![0].name, 'my-mcp-server');
        assert.strictEqual(plugin.mcpServers![0].config.command, 'node');
    });
});
