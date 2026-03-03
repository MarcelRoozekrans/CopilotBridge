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

function makePlugin(overrides: Partial<PluginInfo> = {}): PluginInfo {
    return {
        name: 'test-plugin',
        description: 'test',
        version: '1.0.0',
        skills: [],
        marketplace: 'test/repo',
        source: 'local',
        ...overrides,
    };
}

describe('TreeView marketplace grouping', () => {
    let provider: SkillBridgeTreeProvider;

    beforeEach(() => {
        provider = new SkillBridgeTreeProvider();
    });

    it('should show single plugin directly at root without marketplace wrapper', () => {
        provider.setData([makePlugin({ marketplace: 'obra/superpowers' })], makeManifest());

        const roots = provider.getChildren(undefined);
        assert.strictEqual(roots.length, 1);
        assert.strictEqual(roots[0].itemType, 'plugin');
        assert.strictEqual(roots[0].label, 'test-plugin');
    });

    it('should group multiple plugins under a marketplace node', () => {
        const plugins = [
            makePlugin({ name: 'a11y-audit', marketplace: 'rohitg00/awesome-toolkit' }),
            makePlugin({ name: 'api-tester', marketplace: 'rohitg00/awesome-toolkit' }),
            makePlugin({ name: 'bug-detective', marketplace: 'rohitg00/awesome-toolkit' }),
        ];
        provider.setData(plugins, makeManifest());

        const roots = provider.getChildren(undefined);
        assert.strictEqual(roots.length, 1);
        assert.strictEqual(roots[0].itemType, 'marketplace');
        assert.strictEqual(roots[0].label, 'rohitg00/awesome-toolkit');
        assert.strictEqual(roots[0].description, '3 plugins');
    });

    it('should show plugins under marketplace node', () => {
        const plugins = [
            makePlugin({ name: 'plugin-a', marketplace: 'user/repo' }),
            makePlugin({ name: 'plugin-b', marketplace: 'user/repo' }),
        ];
        provider.setData(plugins, makeManifest());

        const marketplace = provider.getChildren(undefined)[0];
        const children = provider.getChildren(marketplace);
        assert.strictEqual(children.length, 2);
        assert.strictEqual(children[0].itemType, 'plugin');
        assert.strictEqual(children[0].label, 'plugin-a');
        assert.strictEqual(children[1].label, 'plugin-b');
    });

    it('should mix single-plugin repos and multi-plugin repos', () => {
        const plugins = [
            makePlugin({ name: 'superpowers', marketplace: 'obra/superpowers' }),
            makePlugin({ name: 'a11y', marketplace: 'user/toolkit' }),
            makePlugin({ name: 'api', marketplace: 'user/toolkit' }),
        ];
        provider.setData(plugins, makeManifest());

        const roots = provider.getChildren(undefined);
        assert.strictEqual(roots.length, 2);

        const single = roots.find(r => r.itemType === 'plugin')!;
        assert.strictEqual(single.label, 'superpowers');

        const group = roots.find(r => r.itemType === 'marketplace')!;
        assert.strictEqual(group.label, 'user/toolkit');
    });

    it('should set marketplace contextValue and repo icon', () => {
        const plugins = [
            makePlugin({ name: 'a', marketplace: 'user/repo' }),
            makePlugin({ name: 'b', marketplace: 'user/repo' }),
        ];
        provider.setData(plugins, makeManifest());

        const root = provider.getChildren(undefined)[0];
        assert.strictEqual(root.contextValue, 'marketplace');
        assert.strictEqual(root.marketplaceRepo, 'user/repo');
    });

    it('should store marketplaceRepo on marketplace nodes', () => {
        const plugins = [
            makePlugin({ name: 'x', marketplace: 'owner/name' }),
            makePlugin({ name: 'y', marketplace: 'owner/name' }),
        ];
        provider.setData(plugins, makeManifest());

        const root = provider.getChildren(undefined)[0];
        assert.strictEqual(root.marketplaceRepo, 'owner/name');
    });
});

describe('TreeView MCP support', () => {
    let provider: SkillBridgeTreeProvider;

    beforeEach(() => {
        provider = new SkillBridgeTreeProvider();
    });

    it('should show mcpGroup node when plugin has MCP servers', () => {
        const plugin = makePlugin({
            marketplace: 'test',
            mcpServers: [
                { name: 'context7', config: { command: 'npx', args: [] }, pluginName: 'test-plugin', pluginVersion: '1.0.0', marketplace: 'test' },
            ],
        });
        provider.setData([plugin], makeManifest());

        const roots = provider.getChildren(undefined);
        const pluginItem = roots[0];
        const children = provider.getChildren(pluginItem);
        const mcpGroup = children.find(c => c.itemType === 'mcpGroup');
        assert.ok(mcpGroup, 'Should have an mcpGroup child');
    });

    it('should NOT show mcpGroup when plugin has no MCP servers', () => {
        const plugin = makePlugin({ name: 'no-mcp', marketplace: 'test', mcpServers: [] });
        provider.setData([plugin], makeManifest());

        const pluginItem = provider.getChildren(undefined)[0];
        const children = provider.getChildren(pluginItem);
        const mcpGroup = children.find(c => c.itemType === 'mcpGroup');
        assert.strictEqual(mcpGroup, undefined);
    });

    it('should show MCP server nodes under mcpGroup', () => {
        const plugin = makePlugin({
            marketplace: 'test',
            mcpServers: [
                { name: 'server-a', config: { command: 'x' }, pluginName: 'test-plugin', pluginVersion: '1.0.0', marketplace: 'test' },
                { name: 'server-b', config: { url: 'http://x' }, pluginName: 'test-plugin', pluginVersion: '1.0.0', marketplace: 'test' },
            ],
        });
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
        const plugin = makePlugin({
            marketplace: 'test',
            mcpServers: [
                { name: 'imported-srv', config: { command: 'x' }, pluginName: 'test-plugin', pluginVersion: '1.0.0', marketplace: 'test' },
                { name: 'available-srv', config: { command: 'y' }, pluginName: 'test-plugin', pluginVersion: '1.0.0', marketplace: 'test' },
            ],
        });
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
        const plugin = makePlugin({
            name: 'p',
            marketplace: 'm',
            mcpServers: [serverInfo],
        });
        provider.setData([plugin], makeManifest());

        const pluginItem = provider.getChildren(undefined)[0];
        const mcpGroup = provider.getChildren(pluginItem).find(c => c.itemType === 'mcpGroup')!;
        const servers = provider.getChildren(mcpGroup);
        assert.deepStrictEqual(servers[0].mcpServerInfo, serverInfo);
    });
});

describe('TreeView tooltips', () => {
    let provider: SkillBridgeTreeProvider;

    beforeEach(() => {
        provider = new SkillBridgeTreeProvider();
    });

    it('should show skill description as tooltip', () => {
        const plugin = makePlugin({
            name: 'test-plugin',
            marketplace: 'test',
            skills: [{
                name: 'tdd',
                description: 'Write tests before implementation code',
                content: 'TDD content here.',
                pluginName: 'test-plugin',
                pluginVersion: '1.0.0',
                marketplace: 'test',
                source: 'local',
            }],
        });
        provider.setData([plugin], makeManifest());

        const pluginItem = provider.getChildren(undefined)[0];
        const children = provider.getChildren(pluginItem);
        const skill = children.find(c => c.itemType === 'skill');
        assert.strictEqual(skill!.tooltip, 'Write tests before implementation code');
    });

    it('should show plugin description as tooltip', () => {
        const plugin = makePlugin({
            description: 'A collection of developer skills',
            marketplace: 'test',
        });
        provider.setData([plugin], makeManifest());

        const pluginItem = provider.getChildren(undefined)[0];
        assert.strictEqual(pluginItem.tooltip, 'A collection of developer skills');
    });

    it('should show marketplace repo as tooltip', () => {
        const plugins = [
            makePlugin({ name: 'a', marketplace: 'user/repo' }),
            makePlugin({ name: 'b', marketplace: 'user/repo' }),
        ];
        provider.setData(plugins, makeManifest());

        const marketplace = provider.getChildren(undefined)[0];
        assert.strictEqual(marketplace.tooltip, 'Marketplace: user/repo');
    });

    it('should show MCP server command as tooltip', () => {
        const plugin = makePlugin({
            marketplace: 'test',
            mcpServers: [{
                name: 'context7',
                config: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
                pluginName: 'test-plugin',
                pluginVersion: '1.0.0',
                marketplace: 'test',
            }],
        });
        provider.setData([plugin], makeManifest());

        const pluginItem = provider.getChildren(undefined)[0];
        const mcpGroup = provider.getChildren(pluginItem).find(c => c.itemType === 'mcpGroup')!;
        const servers = provider.getChildren(mcpGroup);
        assert.strictEqual(servers[0].tooltip, 'Command: npx -y @upstash/context7-mcp');
    });
});

describe('TreeView skill click command', () => {
    let provider: SkillBridgeTreeProvider;

    beforeEach(() => {
        provider = new SkillBridgeTreeProvider();
    });

    it('should set command on skill items to show content', () => {
        const plugin = makePlugin({
            marketplace: 'test',
            skills: [{
                name: 'tdd',
                description: 'TDD skill',
                content: 'Write tests first.',
                pluginName: 'test-plugin',
                pluginVersion: '1.0.0',
                marketplace: 'test',
                source: 'local',
            }],
        });
        provider.setData([plugin], makeManifest());

        const pluginItem = provider.getChildren(undefined)[0];
        const skill = provider.getChildren(pluginItem).find(c => c.itemType === 'skill')!;
        assert.ok(skill.command, 'Skill should have a click command');
        assert.strictEqual(skill.command!.command, 'copilotSkillBridge.showSkillContent');
        assert.strictEqual(skill.command!.arguments![0], skill);
    });

    it('should not set command on non-skill items', () => {
        const plugin = makePlugin({ marketplace: 'test' });
        provider.setData([plugin], makeManifest());

        const pluginItem = provider.getChildren(undefined)[0];
        assert.strictEqual(pluginItem.command, undefined, 'Plugin item should not have click command');
    });
});

describe('TreeView incompatible skills', () => {
    let provider: SkillBridgeTreeProvider;

    beforeEach(() => {
        provider = new SkillBridgeTreeProvider();
    });

    it('should mark skill as incompatible when it has blocking patterns', () => {
        const plugin = makePlugin({
            name: 'test-plugin',
            marketplace: 'test',
            skills: [{
                name: 'parallel-agents',
                description: 'Dispatch parallel agents',
                content: 'Launch parallel agents to handle work independently.',
                pluginName: 'test-plugin',
                pluginVersion: '1.0.0',
                marketplace: 'test',
                source: 'local',
            }],
        });
        provider.setData([plugin], makeManifest());

        const pluginItem = provider.getChildren(undefined)[0];
        const children = provider.getChildren(pluginItem);
        const skill = children.find(c => c.itemType === 'skill');
        assert.ok(skill, 'Should have a skill child');
        assert.strictEqual(skill!.contextValue, 'skill-incompatible');
        assert.ok(skill!.description?.toString().length! > 0, 'Should have incompatible description');
    });

    it('should mark compatible skill normally', () => {
        const plugin = makePlugin({
            name: 'test-plugin',
            marketplace: 'test',
            skills: [{
                name: 'tdd',
                description: 'Test driven development',
                content: 'Write tests first, then implement.',
                pluginName: 'test-plugin',
                pluginVersion: '1.0.0',
                marketplace: 'test',
                source: 'local',
            }],
        });
        provider.setData([plugin], makeManifest());

        const pluginItem = provider.getChildren(undefined)[0];
        const children = provider.getChildren(pluginItem);
        const skill = children.find(c => c.itemType === 'skill');
        assert.ok(skill, 'Should have a skill child');
        assert.ok(skill!.contextValue !== 'skill-incompatible', 'Should not be incompatible');
    });

    it('should resolve MCP dependency when plugin has MCP servers', () => {
        const plugin = makePlugin({
            name: 'memory-plugin',
            marketplace: 'test',
            skills: [{
                name: 'long-term-memory',
                description: 'Memory skill',
                content: 'Use search_memory to find previous context.',
                pluginName: 'memory-plugin',
                pluginVersion: '1.0.0',
                marketplace: 'test',
                source: 'local',
            }],
            mcpServers: [{
                name: 'memory-server',
                config: { command: 'npx' },
                pluginName: 'memory-plugin',
                pluginVersion: '1.0.0',
                marketplace: 'test',
            }],
        });
        provider.setData([plugin], makeManifest());

        const pluginItem = provider.getChildren(undefined)[0];
        const children = provider.getChildren(pluginItem);
        const skill = children.find(c => c.itemType === 'skill');
        assert.ok(skill!.contextValue !== 'skill-incompatible', 'Should be compatible — MCP server available');
    });
});
