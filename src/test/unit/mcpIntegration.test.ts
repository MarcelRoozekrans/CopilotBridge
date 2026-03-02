import * as assert from 'assert';
import { convertMcpServers } from '../../mcpConverter';
import { mergeMcpConfigs, removeServerFromConfig } from '../../mcpWriter';
import { createEmptyManifest, recordMcpImport, removeMcpRecord, isMcpServerImported } from '../../stateManager';
import { parseMcpJson } from '../../localReader';
import { McpServerInfo, PluginInfo, SkillInfo } from '../../types';
import { ImportService } from '../../importService';
import { SkillBridgeTreeProvider } from '../../treeView';

describe('MCP import integration', () => {
    it('should convert, merge, and track a full import cycle', () => {
        // 1. Simulate discovery from .mcp.json
        const raw = JSON.stringify({
            'context7': { command: 'npx', args: ['-y', '@context7/mcp'] },
            'secure-api': { command: 'node', args: ['srv.js'], env: { API_KEY: 'sk-secret123' } },
        });
        const servers = parseMcpJson(raw, 'superpowers', '4.3.1', 'superpowers-marketplace');
        assert.strictEqual(servers.length, 2);

        // 2. Convert to VS Code format
        const converted = convertMcpServers(servers);
        assert.strictEqual(converted.servers['context7'].type, 'stdio');
        assert.strictEqual(converted.servers['secure-api'].type, 'stdio');
        assert.ok(converted.servers['secure-api'].env!['API_KEY'].startsWith('${input:'));
        assert.strictEqual(converted.inputs.length, 1);

        // 3. Merge into existing config (preserving user servers)
        const existing = { servers: { 'user-custom': { type: 'stdio' as const, command: 'my-cmd' } } };
        const merged = mergeMcpConfigs(existing, converted, []);
        assert.ok(merged.servers['user-custom']);
        assert.ok(merged.servers['context7']);
        assert.ok(merged.servers['secure-api']);

        // 4. Record in manifest
        let manifest = createEmptyManifest();
        manifest = recordMcpImport(manifest, 'context7', 'superpowers@superpowers-marketplace');
        manifest = recordMcpImport(manifest, 'secure-api', 'superpowers@superpowers-marketplace');
        assert.strictEqual(isMcpServerImported(manifest, 'context7'), true);
        assert.strictEqual(isMcpServerImported(manifest, 'secure-api'), true);

        // 5. Remove one server
        const afterRemove = removeServerFromConfig(merged, 'context7');
        assert.strictEqual(afterRemove.servers['context7'], undefined);
        assert.ok(afterRemove.servers['secure-api']);
        assert.ok(afterRemove.servers['user-custom']);

        manifest = removeMcpRecord(manifest, 'context7');
        assert.strictEqual(isMcpServerImported(manifest, 'context7'), false);
        assert.strictEqual(isMcpServerImported(manifest, 'secure-api'), true);
    });

    it('should not overwrite user servers on re-import', () => {
        const servers: McpServerInfo[] = [
            { name: 'user-custom', config: { command: 'bridge-cmd' }, pluginName: 'p', pluginVersion: '1', marketplace: 'm' },
        ];
        const converted = convertMcpServers(servers);
        const existing = { servers: { 'user-custom': { type: 'stdio' as const, command: 'user-cmd' } } };
        // Not in manifest = user-added
        const merged = mergeMcpConfigs(existing, converted, []);
        assert.strictEqual(merged.servers['user-custom'].command, 'user-cmd');
    });

    it('should update bridge-managed servers on re-import', () => {
        const servers: McpServerInfo[] = [
            { name: 'bridge-srv', config: { command: 'new-cmd', args: ['--new'] }, pluginName: 'p', pluginVersion: '2', marketplace: 'm' },
        ];
        const converted = convertMcpServers(servers);
        const existing = { servers: { 'bridge-srv': { type: 'stdio' as const, command: 'old-cmd' } } };
        // In manifest = bridge-managed
        const merged = mergeMcpConfigs(existing, converted, ['bridge-srv']);
        assert.strictEqual(merged.servers['bridge-srv'].command, 'new-cmd');
    });

    it('should handle HTTP servers end-to-end', () => {
        const raw = JSON.stringify({
            'remote': { url: 'https://mcp.example.com/sse' },
        });
        const servers = parseMcpJson(raw, 'test', '1.0.0', 'test');
        const converted = convertMcpServers(servers);
        assert.strictEqual(converted.servers['remote'].type, 'sse');
        assert.strictEqual(converted.servers['remote'].url, 'https://mcp.example.com/sse');

        const merged = mergeMcpConfigs({ servers: {} }, converted, []);
        assert.ok(merged.servers['remote']);
    });
});

describe('Remote MCP discovery integration', () => {
    function makeSkill(name: string, source: 'local' | 'remote'): SkillInfo {
        return { name, description: 'test', content: '# test', pluginName: 'longterm-memory', pluginVersion: '1.0.0', marketplace: 'test', source };
    }

    function makeMcpServer(name: string): McpServerInfo {
        return { name, config: { command: 'npx', args: ['-y', `${name}-mcp`] }, pluginName: 'longterm-memory', pluginVersion: '1.0.0', marketplace: 'MarcelRoozekrans/LongtermMemory-MCP' };
    }

    it('should show MCP servers in TreeView when discovered from remote marketplace', () => {
        // Simulates: remote plugin has .mcp.json, no local cache
        const remotePlugin: PluginInfo = {
            name: 'longterm-memory',
            description: 'Memory plugin',
            version: '1.0.0',
            skills: [makeSkill('long-term-memory', 'remote')],
            mcpServers: [makeMcpServer('longterm-memory')],
            marketplace: 'MarcelRoozekrans/LongtermMemory-MCP',
            source: 'remote',
        };

        const service = new ImportService({ fsPath: '/tmp/test', path: '/tmp/test' } as any);
        const merged = service.mergePluginLists([], [remotePlugin]);

        const treeProvider = new SkillBridgeTreeProvider();
        treeProvider.setData(merged, createEmptyManifest());

        // Plugin should appear
        const roots = treeProvider.getChildren(undefined);
        assert.strictEqual(roots.length, 1);
        assert.strictEqual(roots[0].label, 'longterm-memory');

        // MCP group should appear under plugin
        const children = treeProvider.getChildren(roots[0]);
        const mcpGroup = children.find(c => c.itemType === 'mcpGroup');
        assert.ok(mcpGroup, 'MCP Servers group should appear');

        // MCP server should be listed
        const servers = treeProvider.getChildren(mcpGroup!);
        assert.strictEqual(servers.length, 1);
        assert.strictEqual(servers[0].label, 'longterm-memory');
        assert.strictEqual(servers[0].contextValue, 'mcpServer-available');
    });

    it('should preserve remote MCP servers when merging with local plugin that has none', () => {
        // Simulates: local cache has plugin without .mcp.json, remote has .mcp.json
        const localPlugin: PluginInfo = {
            name: 'longterm-memory',
            description: 'Memory plugin',
            version: '1.0.0',
            skills: [makeSkill('long-term-memory', 'local')],
            marketplace: 'local-cache',
            source: 'local',
            // No mcpServers — local cache doesn't have .mcp.json
        };
        const remotePlugin: PluginInfo = {
            name: 'longterm-memory',
            description: 'Memory plugin',
            version: '1.0.0',
            skills: [makeSkill('long-term-memory', 'remote')],
            mcpServers: [makeMcpServer('longterm-memory')],
            marketplace: 'MarcelRoozekrans/LongtermMemory-MCP',
            source: 'remote',
        };

        const service = new ImportService({ fsPath: '/tmp/test', path: '/tmp/test' } as any);
        const merged = service.mergePluginLists([localPlugin], [remotePlugin]);

        assert.strictEqual(merged.length, 1);
        assert.strictEqual(merged[0].source, 'both');
        assert.ok(merged[0].mcpServers, 'Remote MCP servers should be merged into local plugin');
        assert.strictEqual(merged[0].mcpServers!.length, 1);
        assert.strictEqual(merged[0].mcpServers![0].name, 'longterm-memory');

        // TreeView should show MCP group
        const treeProvider = new SkillBridgeTreeProvider();
        treeProvider.setData(merged, createEmptyManifest());

        const pluginItem = treeProvider.getChildren(undefined)[0];
        const children = treeProvider.getChildren(pluginItem);
        const mcpGroup = children.find(c => c.itemType === 'mcpGroup');
        assert.ok(mcpGroup, 'MCP group should appear after merge');
    });

    it('should parse real LongtermMemory-MCP .mcp.json and show in TreeView', () => {
        // Uses actual .mcp.json content from the repo
        const raw = '{"longterm-memory":{"command":"npx","args":["-y","longterm-memory-mcp"]}}';
        const servers = parseMcpJson(raw, 'longterm-memory', '1.0.0', 'MarcelRoozekrans/LongtermMemory-MCP');

        assert.strictEqual(servers.length, 1);
        assert.strictEqual(servers[0].name, 'longterm-memory');
        assert.strictEqual(servers[0].config.command, 'npx');
        assert.deepStrictEqual(servers[0].config.args, ['-y', 'longterm-memory-mcp']);

        const plugin: PluginInfo = {
            name: 'longterm-memory',
            description: 'Persistent semantic long-term memory',
            version: '1.0.0',
            skills: [makeSkill('long-term-memory', 'remote')],
            mcpServers: servers,
            marketplace: 'MarcelRoozekrans/LongtermMemory-MCP',
            source: 'remote',
        };

        const treeProvider = new SkillBridgeTreeProvider();
        treeProvider.setData([plugin], createEmptyManifest());

        const pluginItem = treeProvider.getChildren(undefined)[0];
        const children = treeProvider.getChildren(pluginItem);

        // Should have both skill and MCP group
        const skillItems = children.filter(c => c.itemType === 'skill');
        const mcpGroup = children.find(c => c.itemType === 'mcpGroup');
        assert.strictEqual(skillItems.length, 1);
        assert.ok(mcpGroup, 'Should have MCP group');

        // MCP server should convert correctly to VS Code format
        const converted = convertMcpServers(servers);
        assert.strictEqual(converted.servers['longterm-memory'].type, 'stdio');
        assert.strictEqual(converted.servers['longterm-memory'].command, 'npx');
        assert.deepStrictEqual(converted.servers['longterm-memory'].args, ['-y', 'longterm-memory-mcp']);
        assert.strictEqual(converted.inputs.length, 0); // No secrets
    });

    it('should track imported MCP server status in TreeView', () => {
        const servers = parseMcpJson(
            '{"longterm-memory":{"command":"npx","args":["-y","longterm-memory-mcp"]}}',
            'longterm-memory', '1.0.0', 'MarcelRoozekrans/LongtermMemory-MCP'
        );

        const plugin: PluginInfo = {
            name: 'longterm-memory',
            description: 'test',
            version: '1.0.0',
            skills: [],
            mcpServers: servers,
            marketplace: 'MarcelRoozekrans/LongtermMemory-MCP',
            source: 'remote',
        };

        // Before import: available
        let manifest = createEmptyManifest();
        const treeProvider = new SkillBridgeTreeProvider();
        treeProvider.setData([plugin], manifest);

        let pluginItem = treeProvider.getChildren(undefined)[0];
        let mcpGroup = treeProvider.getChildren(pluginItem).find(c => c.itemType === 'mcpGroup')!;
        let serverNodes = treeProvider.getChildren(mcpGroup);
        assert.strictEqual(serverNodes[0].contextValue, 'mcpServer-available');

        // After import: synced
        manifest = recordMcpImport(manifest, 'longterm-memory', 'longterm-memory@MarcelRoozekrans/LongtermMemory-MCP');
        treeProvider.setData([plugin], manifest);

        pluginItem = treeProvider.getChildren(undefined)[0];
        mcpGroup = treeProvider.getChildren(pluginItem).find(c => c.itemType === 'mcpGroup')!;
        serverNodes = treeProvider.getChildren(mcpGroup);
        assert.strictEqual(serverNodes[0].contextValue, 'mcpServer-synced');
    });
});
