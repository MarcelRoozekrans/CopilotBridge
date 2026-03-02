import * as assert from 'assert';
import { convertMcpServers } from '../../mcpConverter';
import { mergeMcpConfigs, removeServerFromConfig } from '../../mcpWriter';
import { createEmptyManifest, recordMcpImport, removeMcpRecord, isMcpServerImported } from '../../stateManager';
import { parseMcpJson } from '../../localReader';
import { McpServerInfo } from '../../types';

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
