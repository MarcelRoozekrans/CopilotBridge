import * as assert from 'assert';
import { SkillBridgeTreeProvider, SkillTreeItem } from '../../treeView';
import { PluginInfo, BridgeManifest } from '../../types';

function makeManifest(overrides: Partial<BridgeManifest> = {}): BridgeManifest {
    return {
        skills: {},
        mcpServers: {},
        marketplaces: [],
        settings: { checkInterval: 86400, autoAcceptUpdates: false },
        ...overrides,
    };
}

describe('TreeView MCP support', () => {
    let provider: SkillBridgeTreeProvider;

    beforeEach(() => {
        provider = new SkillBridgeTreeProvider();
    });

    it('should show mcpGroup node when plugin has MCP servers', () => {
        const plugin: PluginInfo = {
            name: 'test-plugin',
            description: 'test',
            version: '1.0.0',
            skills: [],
            marketplace: 'test',
            source: 'local',
            mcpServers: [
                { name: 'context7', config: { command: 'npx', args: [] }, pluginName: 'test-plugin', pluginVersion: '1.0.0', marketplace: 'test' },
            ],
        };
        provider.setData([plugin], makeManifest());

        const roots = provider.getChildren(undefined);
        const pluginItem = roots[0];
        const children = provider.getChildren(pluginItem);
        const mcpGroup = children.find(c => c.itemType === 'mcpGroup');
        assert.ok(mcpGroup, 'Should have an mcpGroup child');
    });

    it('should NOT show mcpGroup when plugin has no MCP servers', () => {
        const plugin: PluginInfo = {
            name: 'no-mcp',
            description: 'test',
            version: '1.0.0',
            skills: [],
            marketplace: 'test',
            source: 'local',
            mcpServers: [],
        };
        provider.setData([plugin], makeManifest());

        const pluginItem = provider.getChildren(undefined)[0];
        const children = provider.getChildren(pluginItem);
        const mcpGroup = children.find(c => c.itemType === 'mcpGroup');
        assert.strictEqual(mcpGroup, undefined);
    });

    it('should show MCP server nodes under mcpGroup', () => {
        const plugin: PluginInfo = {
            name: 'test-plugin',
            description: 'test',
            version: '1.0.0',
            skills: [],
            marketplace: 'test',
            source: 'local',
            mcpServers: [
                { name: 'server-a', config: { command: 'x' }, pluginName: 'test-plugin', pluginVersion: '1.0.0', marketplace: 'test' },
                { name: 'server-b', config: { url: 'http://x' }, pluginName: 'test-plugin', pluginVersion: '1.0.0', marketplace: 'test' },
            ],
        };
        provider.setData([plugin], makeManifest());

        const pluginItem = provider.getChildren(undefined)[0];
        const children = provider.getChildren(pluginItem);
        const mcpGroup = children.find(c => c.itemType === 'mcpGroup')!;
        const servers = provider.getChildren(mcpGroup);
        assert.strictEqual(servers.length, 2);
        assert.strictEqual(servers[0].itemType, 'mcpServer');
        assert.strictEqual(servers[0].label, 'server-a');
    });

    it('should show imported status for MCP servers', () => {
        const plugin: PluginInfo = {
            name: 'test-plugin',
            description: 'test',
            version: '1.0.0',
            skills: [],
            marketplace: 'test',
            source: 'local',
            mcpServers: [
                { name: 'imported-srv', config: { command: 'x' }, pluginName: 'test-plugin', pluginVersion: '1.0.0', marketplace: 'test' },
                { name: 'available-srv', config: { command: 'y' }, pluginName: 'test-plugin', pluginVersion: '1.0.0', marketplace: 'test' },
            ],
        };
        const manifest = makeManifest({
            mcpServers: { 'imported-srv': { source: 'test@test', importedAt: '2026-01-01' } },
        });
        provider.setData([plugin], manifest);

        const pluginItem = provider.getChildren(undefined)[0];
        const mcpGroup = provider.getChildren(pluginItem).find(c => c.itemType === 'mcpGroup')!;
        const servers = provider.getChildren(mcpGroup);

        const imported = servers.find(s => s.label === 'imported-srv')!;
        const available = servers.find(s => s.label === 'available-srv')!;
        assert.strictEqual(imported.contextValue, 'mcpServer-synced');
        assert.strictEqual(available.contextValue, 'mcpServer-available');
    });

    it('should attach mcpServerInfo to server nodes', () => {
        const serverInfo = { name: 'my-srv', config: { command: 'npx', args: ['-y', 'pkg'] }, pluginName: 'p', pluginVersion: '1', marketplace: 'm' };
        const plugin: PluginInfo = {
            name: 'p',
            description: 'test',
            version: '1',
            skills: [],
            marketplace: 'm',
            source: 'local',
            mcpServers: [serverInfo],
        };
        provider.setData([plugin], makeManifest());

        const pluginItem = provider.getChildren(undefined)[0];
        const mcpGroup = provider.getChildren(pluginItem).find(c => c.itemType === 'mcpGroup')!;
        const servers = provider.getChildren(mcpGroup);
        assert.deepStrictEqual(servers[0].mcpServerInfo, serverInfo);
    });
});
