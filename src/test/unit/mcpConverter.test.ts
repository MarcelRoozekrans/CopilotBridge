import * as assert from 'assert';
import { convertMcpServers } from '../../mcpConverter';
import { McpServerInfo } from '../../types';

function makeServer(overrides: Partial<McpServerInfo> = {}): McpServerInfo {
    return {
        name: 'test-server',
        config: { command: 'npx', args: ['-y', '@test/mcp'] },
        pluginName: 'test-plugin',
        pluginVersion: '1.0.0',
        marketplace: 'test',
        ...overrides,
    };
}

describe('convertMcpServers', () => {
    it('should convert a stdio server', () => {
        const result = convertMcpServers([makeServer()]);
        const entry = result.servers['test-server'];
        assert.strictEqual(entry.type, 'stdio');
        assert.strictEqual(entry.command, 'npx');
        assert.deepStrictEqual(entry.args, ['-y', '@test/mcp']);
    });

    it('should include env variables', () => {
        const server = makeServer({
            config: { command: 'node', args: ['server.js'], env: { NODE_ENV: 'production' } },
        });
        const result = convertMcpServers([server]);
        assert.strictEqual(result.servers['test-server'].env!['NODE_ENV'], 'production');
    });

    it('should convert multiple servers', () => {
        const servers = [
            makeServer({ name: 'server-a' }),
            makeServer({ name: 'server-b', config: { command: 'python', args: ['main.py'] } }),
        ];
        const result = convertMcpServers(servers);
        assert.ok(result.servers['server-a']);
        assert.ok(result.servers['server-b']);
        assert.strictEqual(result.servers['server-b'].command, 'python');
    });

    it('should return empty config for empty input', () => {
        const result = convertMcpServers([]);
        assert.deepStrictEqual(result.servers, {});
        assert.deepStrictEqual(result.inputs, []);
    });

    it('should convert an HTTP/SSE server', () => {
        const server = makeServer({
            name: 'remote-mcp',
            config: { url: 'https://mcp.example.com/sse' },
        });
        const result = convertMcpServers([server]);
        const entry = result.servers['remote-mcp'];
        assert.strictEqual(entry.type, 'sse');
        assert.strictEqual(entry.url, 'https://mcp.example.com/sse');
        assert.strictEqual(entry.command, undefined);
    });

    it('should detect secret env vars and create inputs', () => {
        const server = makeServer({
            name: 'api-server',
            config: {
                command: 'node',
                args: ['server.js'],
                env: { API_KEY: 'sk-abc123', NORMAL_VAR: 'hello' },
            },
        });
        const result = convertMcpServers([server]);
        assert.ok(result.servers['api-server'].env!['API_KEY'].startsWith('${input:'));
        assert.strictEqual(result.servers['api-server'].env!['NORMAL_VAR'], 'hello');
        assert.strictEqual(result.inputs.length, 1);
        assert.strictEqual(result.inputs[0].password, true);
        assert.strictEqual(result.inputs[0].type, 'promptString');
    });

    it('should detect ${...} placeholder patterns as secrets', () => {
        const server = makeServer({
            name: 'placeholder-server',
            config: {
                command: 'node',
                args: [],
                env: { MY_TOKEN: '${SOME_TOKEN}' },
            },
        });
        const result = convertMcpServers([server]);
        assert.ok(result.servers['placeholder-server'].env!['MY_TOKEN'].startsWith('${input:'));
        assert.strictEqual(result.inputs.length, 1);
    });

    it('should detect vars with SECRET, TOKEN, PASSWORD in name', () => {
        const server = makeServer({
            name: 'named-secrets',
            config: {
                command: 'node',
                args: [],
                env: {
                    DB_PASSWORD: 'mypass',
                    AUTH_SECRET: 'shh',
                    GITHUB_TOKEN: 'ghp_abc',
                    NORMAL: 'visible',
                },
            },
        });
        const result = convertMcpServers([server]);
        assert.ok(result.servers['named-secrets'].env!['DB_PASSWORD'].startsWith('${input:'));
        assert.ok(result.servers['named-secrets'].env!['AUTH_SECRET'].startsWith('${input:'));
        assert.ok(result.servers['named-secrets'].env!['GITHUB_TOKEN'].startsWith('${input:'));
        assert.strictEqual(result.servers['named-secrets'].env!['NORMAL'], 'visible');
        assert.strictEqual(result.inputs.length, 3);
    });

    it('should not create duplicate inputs for same var across servers', () => {
        const servers = [
            makeServer({ name: 'a', config: { command: 'x', env: { API_KEY: 'sk-1' } } }),
            makeServer({ name: 'b', config: { command: 'y', env: { API_KEY: 'sk-2' } } }),
        ];
        const result = convertMcpServers(servers);
        assert.strictEqual(result.inputs.length, 2);
        assert.notStrictEqual(result.inputs[0].id, result.inputs[1].id);
    });
});
