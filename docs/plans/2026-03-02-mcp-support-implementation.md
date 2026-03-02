# MCP Server Bridge Support — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bridge MCP server definitions from Claude plugin caches into VS Code's `.vscode/mcp.json`, enabling one-click import alongside skills.

**Architecture:** Thin bridge — discover `.mcp.json` in plugin dirs, convert Claude→VS Code format via pure functions, merge into `.vscode/mcp.json` with conflict-safe strategy. Parallel code path to existing skill import, sharing the same orchestrator.

**Tech Stack:** TypeScript, VS Code Extension API, `vscode.workspace.fs` for file I/O, Mocha + assert for tests.

---

### Task 1: Add MCP type definitions

**Files:**
- Modify: `src/types.ts`
- Test: `src/test/unit/types.test.ts`

**Context:** All types live in `src/types.ts`. The existing `BridgeManifest` interface needs a new `mcpServers` field, and we need new interfaces for MCP server data. The existing `PluginInfo` needs an optional `mcpServers` array.

**Step 1: Write the failing test**

Add to `src/test/unit/types.test.ts`:

```typescript
import { BridgeManifest, PluginInfo, McpServerInfo, ClaudeMcpServerConfig, McpServerRecord } from '../../types';

describe('MCP type definitions', () => {
    it('should allow McpServerInfo to be created with stdio config', () => {
        const server: McpServerInfo = {
            name: 'context7',
            config: { command: 'npx', args: ['-y', '@context7/mcp'] },
            pluginName: 'superpowers',
            pluginVersion: '4.3.1',
            marketplace: 'superpowers-marketplace',
        };
        assert.strictEqual(server.name, 'context7');
        assert.strictEqual(server.config.command, 'npx');
    });

    it('should allow McpServerInfo with http config', () => {
        const server: McpServerInfo = {
            name: 'remote-server',
            config: { url: 'https://mcp.example.com/sse' },
            pluginName: 'test-plugin',
            pluginVersion: '1.0.0',
            marketplace: 'test',
        };
        assert.strictEqual(server.config.url, 'https://mcp.example.com/sse');
    });

    it('should allow BridgeManifest with mcpServers field', () => {
        const manifest: BridgeManifest = {
            skills: {},
            mcpServers: {
                'context7': { source: 'superpowers@sp', importedAt: '2026-01-01' },
            },
            marketplaces: [],
            settings: { checkInterval: 86400, autoAcceptUpdates: false },
        };
        assert.ok(manifest.mcpServers['context7']);
    });

    it('should allow PluginInfo with mcpServers array', () => {
        const plugin: PluginInfo = {
            name: 'test',
            description: 'test',
            version: '1.0.0',
            skills: [],
            marketplace: 'test',
            source: 'local',
            mcpServers: [],
        };
        assert.deepStrictEqual(plugin.mcpServers, []);
    });
});
```

**Step 2: Run test to verify it fails**

Run: `npx mocha out/test/unit/types.test.js --timeout 5000`
Expected: FAIL — `McpServerInfo`, `ClaudeMcpServerConfig`, `McpServerRecord` don't exist; `BridgeManifest` doesn't have `mcpServers`; `PluginInfo` doesn't have `mcpServers`.

**Step 3: Write minimal implementation**

In `src/types.ts`, add these interfaces (after the existing `SkillInfo` interface, around line 17):

```typescript
export interface ClaudeMcpServerConfig {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
}

export interface McpServerInfo {
    name: string;
    config: ClaudeMcpServerConfig;
    pluginName: string;
    pluginVersion: string;
    marketplace: string;
}

export interface McpServerRecord {
    source: string;
    importedAt: string;
}
```

Update the `PluginInfo` interface to add:

```typescript
export interface PluginInfo {
    // ... existing fields ...
    mcpServers?: McpServerInfo[];  // add this field
}
```

Update the `BridgeManifest` interface to add:

```typescript
export interface BridgeManifest {
    skills: Record<string, SkillImportState>;
    mcpServers: Record<string, McpServerRecord>;  // add this field
    marketplaces: Array<{ repo: string; lastChecked: string }>;
    settings: {
        checkInterval: number;
        autoAcceptUpdates: boolean;
    };
}
```

**Step 4: Update createEmptyManifest**

In `src/stateManager.ts`, update `createEmptyManifest()` to include `mcpServers: {}`:

```typescript
export function createEmptyManifest(): BridgeManifest {
    return {
        skills: {},
        mcpServers: {},
        marketplaces: [],
        settings: {
            checkInterval: 86400,
            autoAcceptUpdates: false,
        },
    };
}
```

**Step 5: Compile and run tests**

Run: `npm run compile && npx mocha out/test/unit/types.test.js out/test/unit/stateManager.test.js --timeout 5000`
Expected: ALL PASS (including existing stateManager tests — verify `createEmptyManifest` still works)

**Step 6: Commit**

```bash
git add src/types.ts src/stateManager.ts src/test/unit/types.test.ts
git commit -m "feat: add MCP server type definitions and update manifest schema"
```

---

### Task 2: MCP format converter — stdio transport

**Files:**
- Create: `src/mcpConverter.ts`
- Create: `src/test/unit/mcpConverter.test.ts`

**Context:** This is a pure function module. Claude's `.mcp.json` uses flat `{ "server-name": { command, args, env } }`. VS Code uses `{ "servers": { "name": { "type": "stdio", "command", "args", "env" } } }`. We also need to generate `inputs` for secrets.

**Step 1: Write failing tests for stdio conversion**

Create `src/test/unit/mcpConverter.test.ts`:

```typescript
import * as assert from 'assert';
import { convertMcpServers, VsCodeMcpConfig } from '../../mcpConverter';
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
});
```

**Step 2: Run test to verify it fails**

Run: `npm run compile 2>&1 | head -20`
Expected: FAIL — `mcpConverter` module doesn't exist.

**Step 3: Write minimal implementation**

Create `src/mcpConverter.ts`:

```typescript
import { McpServerInfo } from './types';

export interface VsCodeMcpServerEntry {
    type: 'stdio' | 'sse';
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
}

export interface VsCodeInput {
    id: string;
    type: 'promptString';
    description: string;
    password: boolean;
}

export interface VsCodeMcpConfig {
    servers: Record<string, VsCodeMcpServerEntry>;
    inputs: VsCodeInput[];
}

export function convertMcpServers(servers: McpServerInfo[]): VsCodeMcpConfig {
    const result: VsCodeMcpConfig = { servers: {}, inputs: [] };

    for (const server of servers) {
        const { config } = server;

        if (config.url) {
            result.servers[server.name] = {
                type: 'sse',
                url: config.url,
            };
        } else {
            result.servers[server.name] = {
                type: 'stdio',
                command: config.command,
                args: config.args,
                ...(config.env && Object.keys(config.env).length > 0 ? { env: { ...config.env } } : {}),
            };
        }
    }

    return result;
}
```

**Step 4: Compile and run tests**

Run: `npm run compile && npx mocha out/test/unit/mcpConverter.test.js --timeout 5000`
Expected: ALL PASS (4 tests)

**Step 5: Commit**

```bash
git add src/mcpConverter.ts src/test/unit/mcpConverter.test.ts
git commit -m "feat: add MCP converter with stdio transport support"
```

---

### Task 3: MCP converter — HTTP transport and secret detection

**Files:**
- Modify: `src/mcpConverter.ts`
- Modify: `src/test/unit/mcpConverter.test.ts`

**Context:** Extend the converter to handle HTTP/SSE transport and detect secret values in env vars, replacing them with VS Code `${input:...}` variables.

**Step 1: Write failing tests**

Add to `src/test/unit/mcpConverter.test.ts`:

```typescript
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
        // Secret should be replaced with input reference
        assert.ok(result.servers['api-server'].env!['API_KEY'].startsWith('${input:'));
        // Normal var should be preserved
        assert.strictEqual(result.servers['api-server'].env!['NORMAL_VAR'], 'hello');
        // Input entry should be created for the secret
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
        // Each server gets its own namespaced input (a-API_KEY, b-API_KEY)
        assert.strictEqual(result.inputs.length, 2);
        assert.notStrictEqual(result.inputs[0].id, result.inputs[1].id);
    });
```

**Step 2: Run tests to verify they fail**

Run: `npm run compile && npx mocha out/test/unit/mcpConverter.test.js --timeout 5000`
Expected: FAIL — SSE test may pass (already handled), but secret detection tests fail.

**Step 3: Add secret detection logic**

Update `src/mcpConverter.ts` — add a helper and update `convertMcpServers`:

```typescript
const SECRET_NAME_PATTERN = /KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL/i;
const SECRET_VALUE_PATTERN = /^\$\{.+\}$|^sk-|^ghp_|^gho_|^github_pat_/;

function isSecretEnvVar(name: string, value: string): boolean {
    return SECRET_NAME_PATTERN.test(name) || SECRET_VALUE_PATTERN.test(value);
}

export function convertMcpServers(servers: McpServerInfo[]): VsCodeMcpConfig {
    const result: VsCodeMcpConfig = { servers: {}, inputs: [] };
    const inputIds = new Set<string>();

    for (const server of servers) {
        const { config } = server;

        if (config.url) {
            result.servers[server.name] = {
                type: 'sse',
                url: config.url,
            };
        } else {
            const processedEnv: Record<string, string> = {};

            if (config.env) {
                for (const [key, value] of Object.entries(config.env)) {
                    if (isSecretEnvVar(key, value)) {
                        const inputId = `${server.name}-${key}`;
                        processedEnv[key] = `\${input:${inputId}}`;

                        if (!inputIds.has(inputId)) {
                            inputIds.add(inputId);
                            result.inputs.push({
                                id: inputId,
                                type: 'promptString',
                                description: `Enter ${key} for ${server.name}`,
                                password: true,
                            });
                        }
                    } else {
                        processedEnv[key] = value;
                    }
                }
            }

            result.servers[server.name] = {
                type: 'stdio',
                command: config.command,
                args: config.args,
                ...(Object.keys(processedEnv).length > 0 ? { env: processedEnv } : {}),
            };
        }
    }

    return result;
}
```

**Step 4: Compile and run tests**

Run: `npm run compile && npx mocha out/test/unit/mcpConverter.test.js --timeout 5000`
Expected: ALL PASS (9 tests)

**Step 5: Commit**

```bash
git add src/mcpConverter.ts src/test/unit/mcpConverter.test.ts
git commit -m "feat: add HTTP transport and secret detection to MCP converter"
```

---

### Task 4: MCP config writer — merge logic

**Files:**
- Create: `src/mcpWriter.ts`
- Create: `src/test/unit/mcpWriter.test.ts`

**Context:** This module handles reading `.vscode/mcp.json`, merging bridge-managed servers, and writing back. The merge function is pure (no I/O) for testability. The read/write functions use `vscode.workspace.fs`.

**Step 1: Write failing tests**

Create `src/test/unit/mcpWriter.test.ts`:

```typescript
import * as assert from 'assert';
import { mergeMcpConfigs } from '../../mcpWriter';

describe('mergeMcpConfigs', () => {
    it('should add new servers to empty config', () => {
        const existing = { servers: {} };
        const incoming = {
            servers: { 'my-server': { type: 'stdio' as const, command: 'node', args: ['s.js'] } },
            inputs: [],
        };
        const result = mergeMcpConfigs(existing, incoming, []);
        assert.ok(result.servers['my-server']);
        assert.strictEqual(result.servers['my-server'].command, 'node');
    });

    it('should update bridge-managed servers', () => {
        const existing = {
            servers: { 'my-server': { type: 'stdio' as const, command: 'old-cmd' } },
        };
        const incoming = {
            servers: { 'my-server': { type: 'stdio' as const, command: 'new-cmd' } },
            inputs: [],
        };
        // 'my-server' is in manifest = bridge-managed
        const result = mergeMcpConfigs(existing, incoming, ['my-server']);
        assert.strictEqual(result.servers['my-server'].command, 'new-cmd');
    });

    it('should NOT overwrite user-added servers', () => {
        const existing = {
            servers: { 'user-server': { type: 'stdio' as const, command: 'user-cmd' } },
        };
        const incoming = {
            servers: { 'user-server': { type: 'stdio' as const, command: 'bridge-cmd' } },
            inputs: [],
        };
        // 'user-server' is NOT in manifest = user-added
        const result = mergeMcpConfigs(existing, incoming, []);
        assert.strictEqual(result.servers['user-server'].command, 'user-cmd');
    });

    it('should preserve existing user servers when adding new bridge servers', () => {
        const existing = {
            servers: { 'user-server': { type: 'stdio' as const, command: 'user-cmd' } },
        };
        const incoming = {
            servers: { 'bridge-server': { type: 'stdio' as const, command: 'bridge-cmd' } },
            inputs: [],
        };
        const result = mergeMcpConfigs(existing, incoming, []);
        assert.ok(result.servers['user-server']);
        assert.ok(result.servers['bridge-server']);
    });

    it('should merge inputs without duplicating by id', () => {
        const existing = {
            servers: {},
            inputs: [{ id: 'existing-input', type: 'promptString' as const, description: 'old', password: true }],
        };
        const incoming = {
            servers: {},
            inputs: [
                { id: 'existing-input', type: 'promptString' as const, description: 'new', password: true },
                { id: 'new-input', type: 'promptString' as const, description: 'brand new', password: true },
            ],
        };
        const result = mergeMcpConfigs(existing, incoming, []);
        const ids = result.inputs!.map((i: any) => i.id);
        assert.strictEqual(ids.length, 2);
        assert.ok(ids.includes('existing-input'));
        assert.ok(ids.includes('new-input'));
    });

    it('should handle missing inputs array in existing config', () => {
        const existing = { servers: {} };
        const incoming = {
            servers: {},
            inputs: [{ id: 'new', type: 'promptString' as const, description: 'test', password: true }],
        };
        const result = mergeMcpConfigs(existing, incoming, []);
        assert.strictEqual(result.inputs!.length, 1);
    });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run compile 2>&1 | head -5`
Expected: FAIL — `mcpWriter` module doesn't exist.

**Step 3: Write minimal implementation**

Create `src/mcpWriter.ts`:

```typescript
import * as vscode from 'vscode';
import { VsCodeMcpConfig, VsCodeMcpServerEntry, VsCodeInput } from './mcpConverter';

interface McpJsonFile {
    servers: Record<string, any>;
    inputs?: any[];
}

export function mergeMcpConfigs(
    existing: McpJsonFile,
    incoming: VsCodeMcpConfig,
    manifestManagedNames: string[],
): McpJsonFile {
    const merged: McpJsonFile = {
        servers: { ...existing.servers },
    };

    for (const [name, entry] of Object.entries(incoming.servers)) {
        const existsInFile = name in existing.servers;
        const isBridgeManaged = manifestManagedNames.includes(name);

        if (!existsInFile) {
            // New server — add it
            merged.servers[name] = entry;
        } else if (isBridgeManaged) {
            // Bridge-managed — update it
            merged.servers[name] = entry;
        }
        // else: user-added — skip
    }

    // Merge inputs
    const existingInputs: any[] = existing.inputs ?? [];
    const existingIds = new Set(existingInputs.map((i: any) => i.id));
    const newInputs = incoming.inputs.filter(i => !existingIds.has(i.id));
    if (existingInputs.length > 0 || newInputs.length > 0) {
        merged.inputs = [...existingInputs, ...newInputs];
    }

    return merged;
}

export async function readMcpJson(workspaceUri: vscode.Uri): Promise<McpJsonFile> {
    const fileUri = vscode.Uri.joinPath(workspaceUri, '.vscode', 'mcp.json');
    try {
        const raw = await vscode.workspace.fs.readFile(fileUri);
        return JSON.parse(Buffer.from(raw).toString('utf-8'));
    } catch {
        return { servers: {} };
    }
}

export async function writeMcpJson(workspaceUri: vscode.Uri, config: McpJsonFile): Promise<void> {
    const dir = vscode.Uri.joinPath(workspaceUri, '.vscode');
    await vscode.workspace.fs.createDirectory(dir);
    const fileUri = vscode.Uri.joinPath(dir, 'mcp.json');
    const content = JSON.stringify(config, null, 2);
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));
}

export function removeServerFromConfig(config: McpJsonFile, serverName: string): McpJsonFile {
    const { [serverName]: _, ...remainingServers } = config.servers;
    const remainingInputs = (config.inputs ?? []).filter(
        (i: any) => !i.id.startsWith(`${serverName}-`)
    );
    return {
        servers: remainingServers,
        ...(remainingInputs.length > 0 ? { inputs: remainingInputs } : {}),
    };
}
```

**Step 4: Compile and run tests**

Run: `npm run compile && npx mocha out/test/unit/mcpWriter.test.js --timeout 5000`
Expected: ALL PASS (6 tests)

**Step 5: Commit**

```bash
git add src/mcpWriter.ts src/test/unit/mcpWriter.test.ts
git commit -m "feat: add MCP config writer with merge logic"
```

---

### Task 5: MCP writer — removal and I/O tests

**Files:**
- Modify: `src/test/unit/mcpWriter.test.ts`

**Context:** Add tests for `removeServerFromConfig` and verify the pure function handles edge cases.

**Step 1: Write failing tests**

Add to `src/test/unit/mcpWriter.test.ts`:

```typescript
import { removeServerFromConfig } from '../../mcpWriter';

describe('removeServerFromConfig', () => {
    it('should remove a server by name', () => {
        const config = {
            servers: {
                'bridge-server': { type: 'stdio' as const, command: 'node' },
                'user-server': { type: 'stdio' as const, command: 'python' },
            },
        };
        const result = removeServerFromConfig(config, 'bridge-server');
        assert.strictEqual(result.servers['bridge-server'], undefined);
        assert.ok(result.servers['user-server']);
    });

    it('should remove associated inputs', () => {
        const config = {
            servers: { 'my-srv': { type: 'stdio' as const, command: 'node' } },
            inputs: [
                { id: 'my-srv-API_KEY', type: 'promptString', description: 'key', password: true },
                { id: 'other-srv-TOKEN', type: 'promptString', description: 'tok', password: true },
            ],
        };
        const result = removeServerFromConfig(config, 'my-srv');
        assert.strictEqual(result.inputs!.length, 1);
        assert.strictEqual(result.inputs![0].id, 'other-srv-TOKEN');
    });

    it('should return config unchanged if server not found', () => {
        const config = { servers: { 'a': { type: 'stdio' as const, command: 'x' } } };
        const result = removeServerFromConfig(config, 'nonexistent');
        assert.ok(result.servers['a']);
    });

    it('should not include inputs key when no inputs remain', () => {
        const config = {
            servers: { 'srv': { type: 'stdio' as const, command: 'x' } },
            inputs: [{ id: 'srv-KEY', type: 'promptString', description: 'k', password: true }],
        };
        const result = removeServerFromConfig(config, 'srv');
        assert.strictEqual(result.inputs, undefined);
    });
});
```

**Step 2: Compile and run tests**

Run: `npm run compile && npx mocha out/test/unit/mcpWriter.test.js --timeout 5000`
Expected: ALL PASS (10 tests total)

**Step 3: Commit**

```bash
git add src/test/unit/mcpWriter.test.ts
git commit -m "test: add removal and edge case tests for MCP writer"
```

---

### Task 6: MCP state manager functions

**Files:**
- Modify: `src/stateManager.ts`
- Modify: `src/test/unit/stateManager.test.ts`

**Context:** Add `recordMcpImport` and `removeMcpRecord` functions that mirror the existing `recordImport`/`removeSkillRecord` pattern but operate on `manifest.mcpServers`.

**Step 1: Write failing tests**

Add to `src/test/unit/stateManager.test.ts`:

```typescript
import { recordMcpImport, removeMcpRecord, isMcpServerImported } from '../../stateManager';

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
```

**Step 2: Run tests to verify they fail**

Run: `npm run compile 2>&1 | head -10`
Expected: FAIL — `recordMcpImport`, `removeMcpRecord`, `isMcpServerImported` don't exist.

**Step 3: Write minimal implementation**

Add to `src/stateManager.ts`:

```typescript
export function isMcpServerImported(manifest: BridgeManifest, serverName: string): boolean {
    return serverName in (manifest.mcpServers ?? {});
}

export function recordMcpImport(
    manifest: BridgeManifest,
    serverName: string,
    source: string,
): BridgeManifest {
    return {
        ...manifest,
        mcpServers: {
            ...(manifest.mcpServers ?? {}),
            [serverName]: {
                source,
                importedAt: new Date().toISOString(),
            },
        },
    };
}

export function removeMcpRecord(manifest: BridgeManifest, serverName: string): BridgeManifest {
    const { [serverName]: _, ...remaining } = (manifest.mcpServers ?? {});
    return { ...manifest, mcpServers: remaining };
}
```

**Step 4: Compile and run tests**

Run: `npm run compile && npx mocha out/test/unit/stateManager.test.js --timeout 5000`
Expected: ALL PASS (all existing + 6 new tests)

**Step 5: Commit**

```bash
git add src/stateManager.ts src/test/unit/stateManager.test.ts
git commit -m "feat: add MCP server state management functions"
```

---

### Task 7: Discover MCP servers from local plugin cache

**Files:**
- Modify: `src/localReader.ts`
- Modify: `src/test/unit/localReader.test.ts` (if it exists, otherwise create it)

**Context:** During plugin discovery in `discoverLocalPlugins()`, after reading skills, also check for `.mcp.json` in the plugin version directory. Parse it and attach `mcpServers` to the `PluginInfo`.

The `.mcp.json` file sits at `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/.mcp.json` (same level as `.claude-plugin/`). Its format is:

```json
{
  "context7": { "command": "npx", "args": ["-y", "@context7/mcp"] },
  "playwright": { "command": "npx", "args": ["-y", "@playwright/mcp"] }
}
```

**Step 1: Write failing test**

The existing localReader tests mock the filesystem. Add a test for MCP discovery. Check if `src/test/unit/localReader.test.ts` exists. If it does, add to it. If not, this test will verify the behavior via the function signature.

Add or create in `src/test/unit/localReader.test.ts` a test that verifies `discoverLocalPlugins` includes `mcpServers` on the returned `PluginInfo` when `.mcp.json` exists:

```typescript
it('should discover MCP servers from .mcp.json', async () => {
    // This test depends on the mock filesystem setup in the test file.
    // The key assertion: PluginInfo should have mcpServers array.
    // Since this modifies existing complex mocking, we test the parser directly.
});
```

Instead, test the new helper function directly. Add a test:

```typescript
import { parseMcpJson } from '../../localReader';

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
```

**Step 2: Run test to verify it fails**

Run: `npm run compile 2>&1 | head -5`
Expected: FAIL — `parseMcpJson` doesn't exist in `localReader`.

**Step 3: Write the parser and integrate into discovery**

Add to `src/localReader.ts`:

```typescript
import { McpServerInfo, ClaudeMcpServerConfig } from './types';

export function parseMcpJson(
    raw: string,
    pluginName: string,
    pluginVersion: string,
    marketplace: string,
): McpServerInfo[] {
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            return [];
        }
        return Object.entries(parsed).map(([name, config]) => ({
            name,
            config: config as ClaudeMcpServerConfig,
            pluginName,
            pluginVersion,
            marketplace,
        }));
    } catch {
        return [];
    }
}
```

Then in `discoverLocalPlugins`, after the skills discovery line (`const skills = await discoverSkillsInDir(...)`) and before `plugins.push(...)`, add:

```typescript
            // Discover MCP servers
            let mcpServers: McpServerInfo[] = [];
            try {
                const mcpJsonUri = vscode.Uri.joinPath(versionUri, '.mcp.json');
                const mcpRaw = await vscode.workspace.fs.readFile(mcpJsonUri);
                mcpServers = parseMcpJson(
                    Buffer.from(mcpRaw).toString('utf-8'),
                    pluginMeta.name,
                    latestVersion,
                    marketplaceName,
                );
            } catch {
                // No .mcp.json — that's fine
            }
```

And update the `plugins.push(...)` call to include `mcpServers`:

```typescript
            plugins.push({
                name: pluginMeta.name,
                description: pluginMeta.description,
                version: latestVersion,
                author: pluginMeta.author,
                skills,
                marketplace: marketplaceName,
                source: 'local',
                mcpServers,
            });
```

**Step 4: Compile and run tests**

Run: `npm run compile && npx mocha out/test/unit/localReader.test.js --timeout 5000`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/localReader.ts src/test/unit/localReader.test.ts
git commit -m "feat: discover MCP servers from .mcp.json in plugin cache"
```

---

### Task 8: TreeView — add MCP group and server nodes

**Files:**
- Modify: `src/treeView.ts`
- Modify: `src/test/unit/treeView.test.ts` (create if needed)

**Context:** The TreeView currently has two `TreeItemType` values: `'plugin'` and `'skill'`. We add `'mcpGroup'` and `'mcpServer'`. The `getChildren` method needs to return an MCP group node after skills when the plugin has MCP servers.

**Step 1: Write failing tests**

Create or add to `src/test/unit/treeView.test.ts`:

```typescript
import * as assert from 'assert';
import { SkillBridgeTreeProvider, SkillTreeItem } from '../../treeView';
import { PluginInfo, BridgeManifest } from '../../types';

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
        const manifest: BridgeManifest = { skills: {}, mcpServers: {}, marketplaces: [], settings: { checkInterval: 86400, autoAcceptUpdates: false } };
        provider.setData([plugin], manifest);

        const roots = provider.getChildren(undefined);
        const pluginItem = roots[0];
        const children = provider.getChildren(pluginItem);
        const mcpGroup = children.find((c: SkillTreeItem) => c.itemType === 'mcpGroup');
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
        const manifest: BridgeManifest = { skills: {}, mcpServers: {}, marketplaces: [], settings: { checkInterval: 86400, autoAcceptUpdates: false } };
        provider.setData([plugin], manifest);

        const pluginItem = provider.getChildren(undefined)[0];
        const children = provider.getChildren(pluginItem);
        const mcpGroup = children.find((c: SkillTreeItem) => c.itemType === 'mcpGroup');
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
        const manifest: BridgeManifest = { skills: {}, mcpServers: {}, marketplaces: [], settings: { checkInterval: 86400, autoAcceptUpdates: false } };
        provider.setData([plugin], manifest);

        const pluginItem = provider.getChildren(undefined)[0];
        const children = provider.getChildren(pluginItem);
        const mcpGroup = children.find((c: SkillTreeItem) => c.itemType === 'mcpGroup')!;
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
        const manifest: BridgeManifest = {
            skills: {},
            mcpServers: { 'imported-srv': { source: 'test@test', importedAt: '2026-01-01' } },
            marketplaces: [],
            settings: { checkInterval: 86400, autoAcceptUpdates: false },
        };
        provider.setData([plugin], manifest);

        const pluginItem = provider.getChildren(undefined)[0];
        const mcpGroup = provider.getChildren(pluginItem).find((c: SkillTreeItem) => c.itemType === 'mcpGroup')!;
        const servers = provider.getChildren(mcpGroup);

        const imported = servers.find((s: SkillTreeItem) => s.label === 'imported-srv')!;
        const available = servers.find((s: SkillTreeItem) => s.label === 'available-srv')!;
        assert.strictEqual(imported.contextValue, 'mcpServer-synced');
        assert.strictEqual(available.contextValue, 'mcpServer-available');
    });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run compile 2>&1 | head -10`
Expected: FAIL — `mcpGroup` and `mcpServer` are not valid `TreeItemType` values.

**Step 3: Implement TreeView MCP support**

Update `src/treeView.ts`:

1. Change `TreeItemType`:

```typescript
export type TreeItemType = 'plugin' | 'skill' | 'mcpGroup' | 'mcpServer';
```

2. Update the `SkillTreeItem` constructor to handle new types. Add these cases after the `skill` case:

```typescript
        } else if (itemType === 'mcpGroup') {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            this.iconPath = new vscode.ThemeIcon('plug');
            this.contextValue = 'mcpGroup';
        } else if (itemType === 'mcpServer') {
            this.contextValue = `mcpServer-${status}`;
            if (status === 'synced') {
                this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
                this.description = 'imported';
            } else {
                this.iconPath = new vscode.ThemeIcon('cloud-download');
                this.description = 'available';
            }
        }
```

3. Add an `mcpServers` property to the constructor (optional, pass as additional data). Actually, store MCP servers on the tree item. Add a property:

```typescript
    public readonly mcpServers?: McpServerInfo[],
```

The constructor signature becomes:

```typescript
    constructor(
        public readonly label: string,
        public readonly itemType: TreeItemType,
        public readonly pluginInfo?: PluginInfo,
        public readonly skillInfo?: SkillInfo,
        public readonly status?: SkillStatus,
        collapsibleState?: vscode.TreeItemCollapsibleState,
        public readonly mcpServerInfo?: McpServerInfo,
    )
```

4. Update `getChildren` in the provider. After returning skills for a plugin, also return the MCP group:

```typescript
    getChildren(element?: SkillTreeItem): SkillTreeItem[] {
        if (!element) {
            return this.plugins.map(p => new SkillTreeItem(p.name, 'plugin', p));
        }

        if (element.itemType === 'plugin' && element.pluginInfo) {
            const children: SkillTreeItem[] = [];

            // Skills
            for (const skill of element.pluginInfo.skills) {
                const hash = computeHash(skill.content);
                let status: SkillStatus;
                if (!isSkillImported(this.manifest, skill.name)) {
                    status = 'available';
                } else if (isSkillOutdated(this.manifest, skill.name, hash)) {
                    const state = this.manifest.skills[skill.name];
                    status = state.locallyModified ? 'conflict' : 'update-available';
                } else {
                    status = 'synced';
                }
                children.push(new SkillTreeItem(skill.name, 'skill', element.pluginInfo, skill, status));
            }

            // MCP group
            const mcpServers = element.pluginInfo.mcpServers ?? [];
            if (mcpServers.length > 0) {
                children.push(new SkillTreeItem('MCP Servers', 'mcpGroup', element.pluginInfo));
            }

            return children;
        }

        if (element.itemType === 'mcpGroup' && element.pluginInfo) {
            const servers = element.pluginInfo.mcpServers ?? [];
            return servers.map(srv => {
                const imported = srv.name in (this.manifest.mcpServers ?? {});
                const status: SkillStatus = imported ? 'synced' : 'available';
                return new SkillTreeItem(srv.name, 'mcpServer', element.pluginInfo, undefined, status, undefined, srv);
            });
        }

        return [];
    }
```

5. Import `McpServerInfo` from types at the top of the file.

**Step 4: Compile and run tests**

Run: `npm run compile && npx mocha out/test/unit/treeView.test.js --timeout 5000`
Expected: ALL PASS (4 new tests)

**Step 5: Commit**

```bash
git add src/treeView.ts src/test/unit/treeView.test.ts
git commit -m "feat: add MCP server nodes to TreeView"
```

---

### Task 9: Import Service — MCP import and removal

**Files:**
- Modify: `src/importService.ts`
- Modify: `src/test/unit/importService.test.ts`

**Context:** Add `importMcpServer`, `importAllMcpServers`, and `removeMcpServer` methods to `ImportService`. These call the converter, writer, and state manager.

**Step 1: Write failing tests**

Add to `src/test/unit/importService.test.ts`:

```typescript
import { McpServerInfo } from '../../types';

function makeMcpServer(overrides: Partial<McpServerInfo> = {}): McpServerInfo {
    return {
        name: 'test-mcp-server',
        config: { command: 'npx', args: ['-y', '@test/mcp'] },
        pluginName: 'test-plugin',
        pluginVersion: '1.0.0',
        marketplace: 'test-marketplace',
        ...overrides,
    };
}

describe('ImportService.importMcpServer', () => {
    it('should be a callable method', () => {
        assert.strictEqual(typeof service.importMcpServer, 'function');
    });
});

describe('ImportService.importAllMcpServers', () => {
    it('should be a callable method', () => {
        assert.strictEqual(typeof service.importAllMcpServers, 'function');
    });
});

describe('ImportService.removeMcpServer', () => {
    it('should be a callable method', () => {
        assert.strictEqual(typeof service.removeMcpServer, 'function');
    });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run compile && npx mocha out/test/unit/importService.test.js --timeout 5000`
Expected: FAIL — methods don't exist.

**Step 3: Implement the methods**

Add to `src/importService.ts`:

```typescript
import { convertMcpServers } from './mcpConverter';
import { readMcpJson, writeMcpJson, mergeMcpConfigs, removeServerFromConfig } from './mcpWriter';
import { recordMcpImport, removeMcpRecord, isMcpServerImported } from './stateManager';
import { McpServerInfo } from './types';
```

Add methods to the `ImportService` class:

```typescript
    async importMcpServer(server: McpServerInfo): Promise<void> {
        const converted = convertMcpServers([server]);

        // Read existing .vscode/mcp.json
        const existing = await readMcpJson(this.workspaceUri);

        // Get manifest-managed server names
        let manifest = await loadManifest(this.workspaceUri);
        const managedNames = Object.keys(manifest.mcpServers ?? {});

        // Merge
        const merged = mergeMcpConfigs(existing, converted, managedNames);
        await writeMcpJson(this.workspaceUri, merged);

        // Update manifest
        const source = `${server.pluginName}@${server.marketplace}`;
        manifest = recordMcpImport(manifest, server.name, source);
        await saveManifest(this.workspaceUri, manifest);

        vscode.window.showInformationMessage(`Imported MCP server: ${server.name}`);
    }

    async importAllMcpServers(servers: McpServerInfo[]): Promise<void> {
        for (const server of servers) {
            const manifest = await loadManifest(this.workspaceUri);
            if (!isMcpServerImported(manifest, server.name)) {
                await this.importMcpServer(server);
            }
        }
    }

    async removeMcpServer(serverName: string): Promise<void> {
        // Only remove if bridge-managed
        let manifest = await loadManifest(this.workspaceUri);
        if (!isMcpServerImported(manifest, serverName)) {
            return;
        }

        // Remove from .vscode/mcp.json
        const existing = await readMcpJson(this.workspaceUri);
        const updated = removeServerFromConfig(existing, serverName);
        await writeMcpJson(this.workspaceUri, updated);

        // Remove from manifest
        manifest = removeMcpRecord(manifest, serverName);
        await saveManifest(this.workspaceUri, manifest);

        vscode.window.showInformationMessage(`Removed MCP server: ${serverName}`);
    }
```

**Step 4: Compile and run tests**

Run: `npm run compile && npx mocha out/test/unit/importService.test.js --timeout 5000`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/importService.ts src/test/unit/importService.test.ts
git commit -m "feat: add MCP import/remove methods to ImportService"
```

---

### Task 10: Register commands and menus in extension and package.json

**Files:**
- Modify: `src/extension.ts`
- Modify: `package.json`

**Context:** Register three new commands: `importMcpServer`, `importAllMcpServers`, `removeMcpServer`. Wire them to the ImportService methods. Update `package.json` with command definitions and context menus. Also update `importAllSkills` to include MCP servers.

**Step 1: Update package.json — add commands**

Add to the `contributes.commands` array in `package.json`:

```json
{
    "command": "copilotSkillBridge.importMcpServer",
    "title": "Import MCP Server",
    "icon": "$(cloud-download)"
},
{
    "command": "copilotSkillBridge.importAllMcpServers",
    "title": "Import All MCP Servers",
    "icon": "$(cloud-download)"
},
{
    "command": "copilotSkillBridge.removeMcpServer",
    "title": "Remove MCP Server",
    "icon": "$(trash)"
}
```

**Step 2: Update package.json — add context menus**

Add to `contributes.menus.view/item/context`:

```json
{
    "command": "copilotSkillBridge.importMcpServer",
    "when": "view == skillBridgeExplorer && viewItem == mcpServer-available",
    "group": "inline"
},
{
    "command": "copilotSkillBridge.removeMcpServer",
    "when": "view == skillBridgeExplorer && viewItem == mcpServer-synced",
    "group": "inline"
},
{
    "command": "copilotSkillBridge.importAllMcpServers",
    "when": "view == skillBridgeExplorer && viewItem == mcpGroup"
}
```

**Step 3: Register commands in extension.ts**

Add these command registrations to the workspace-dependent commands section in `src/extension.ts`:

```typescript
        vscode.commands.registerCommand('copilotSkillBridge.importMcpServer', async (item?: SkillTreeItem) => {
            if (item?.mcpServerInfo) {
                await importService.importMcpServer(item.mcpServerInfo);
                await refreshAll();
            } else {
                vscode.window.showWarningMessage('Select an MCP server from the Copilot Skill Bridge sidebar.');
            }
        }),

        vscode.commands.registerCommand('copilotSkillBridge.importAllMcpServers', async (item?: SkillTreeItem) => {
            const plugin = item?.pluginInfo;
            if (!plugin?.mcpServers?.length) {
                vscode.window.showWarningMessage('No MCP servers found for this plugin.');
                return;
            }
            await importService.importAllMcpServers(plugin.mcpServers);
            await refreshAll();
        }),

        vscode.commands.registerCommand('copilotSkillBridge.removeMcpServer', async (item?: SkillTreeItem) => {
            if (item?.mcpServerInfo) {
                await importService.removeMcpServer(item.mcpServerInfo.name);
                await refreshAll();
            }
        }),
```

Also update the existing `importAllSkills` command to include MCP servers:

```typescript
        vscode.commands.registerCommand('copilotSkillBridge.importAllSkills', async (item?: SkillTreeItem) => {
            const plugin = item?.pluginInfo;
            if (!plugin) {
                vscode.window.showWarningMessage('Select a plugin from the Copilot Skill Bridge sidebar.');
                return;
            }
            for (const skill of plugin.skills) {
                await importService.importSkill(skill, outputFormats, generateRegistry);
            }
            // Also import MCP servers
            if (plugin.mcpServers?.length) {
                await importService.importAllMcpServers(plugin.mcpServers);
            }
            await refreshAll();
        }),
```

Also add no-workspace stubs for the new commands:

```typescript
    const workspaceCommands = [
        'copilotSkillBridge.importSkill',
        'copilotSkillBridge.importAllSkills',
        'copilotSkillBridge.checkForUpdates',
        'copilotSkillBridge.removeSkill',
        'copilotSkillBridge.rebuildRegistry',
        'copilotSkillBridge.importMcpServer',       // add
        'copilotSkillBridge.importAllMcpServers',   // add
        'copilotSkillBridge.removeMcpServer',       // add
    ];
```

**Step 4: Compile and run all tests**

Run: `npm run compile && npm test`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/extension.ts package.json
git commit -m "feat: register MCP server commands and context menus"
```

---

### Task 11: Integration test — full MCP import/remove flow

**Files:**
- Create: `src/test/unit/mcpIntegration.test.ts`

**Context:** End-to-end test that exercises: convert → merge → write → state update → removal. Uses the vscode mock's filesystem stubs.

**Step 1: Write the integration test**

Create `src/test/unit/mcpIntegration.test.ts`:

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';
import { convertMcpServers } from '../../mcpConverter';
import { mergeMcpConfigs, removeServerFromConfig } from '../../mcpWriter';
import { createEmptyManifest, recordMcpImport, removeMcpRecord, isMcpServerImported } from '../../stateManager';
import { McpServerInfo } from '../../types';

describe('MCP import integration', () => {
    it('should convert, merge, and track a full import cycle', () => {
        // 1. Define servers as discovered from plugin
        const servers: McpServerInfo[] = [
            {
                name: 'context7',
                config: { command: 'npx', args: ['-y', '@context7/mcp'] },
                pluginName: 'superpowers',
                pluginVersion: '4.3.1',
                marketplace: 'superpowers-marketplace',
            },
            {
                name: 'secure-api',
                config: { command: 'node', args: ['srv.js'], env: { API_KEY: 'sk-secret123' } },
                pluginName: 'superpowers',
                pluginVersion: '4.3.1',
                marketplace: 'superpowers-marketplace',
            },
        ];

        // 2. Convert to VS Code format
        const converted = convertMcpServers(servers);
        assert.strictEqual(converted.servers['context7'].type, 'stdio');
        assert.strictEqual(converted.servers['secure-api'].type, 'stdio');
        assert.ok(converted.servers['secure-api'].env!['API_KEY'].startsWith('${input:'));
        assert.strictEqual(converted.inputs.length, 1);

        // 3. Merge into empty existing config
        const existing = { servers: { 'user-custom': { type: 'stdio' as const, command: 'my-cmd' } } };
        const merged = mergeMcpConfigs(existing, converted, []);
        assert.ok(merged.servers['user-custom']);  // preserved
        assert.ok(merged.servers['context7']);      // added
        assert.ok(merged.servers['secure-api']);    // added

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
});
```

**Step 2: Compile and run**

Run: `npm run compile && npx mocha out/test/unit/mcpIntegration.test.js --timeout 5000`
Expected: ALL PASS

**Step 3: Run full test suite**

Run: `npm test`
Expected: ALL PASS (all existing + all new tests)

**Step 4: Commit**

```bash
git add src/test/unit/mcpIntegration.test.ts
git commit -m "test: add MCP integration test for full import/remove cycle"
```

---

## Summary

| Task | Description | New/Modified Files |
|------|-------------|--------------------|
| 1 | Type definitions | `types.ts`, `stateManager.ts`, `types.test.ts` |
| 2 | MCP converter — stdio | `mcpConverter.ts`, `mcpConverter.test.ts` |
| 3 | MCP converter — HTTP + secrets | `mcpConverter.ts`, `mcpConverter.test.ts` |
| 4 | MCP config writer — merge | `mcpWriter.ts`, `mcpWriter.test.ts` |
| 5 | MCP writer — removal tests | `mcpWriter.test.ts` |
| 6 | State manager — MCP functions | `stateManager.ts`, `stateManager.test.ts` |
| 7 | Local reader — discover .mcp.json | `localReader.ts`, `localReader.test.ts` |
| 8 | TreeView — MCP nodes | `treeView.ts`, `treeView.test.ts` |
| 9 | Import Service — MCP methods | `importService.ts`, `importService.test.ts` |
| 10 | Extension + package.json | `extension.ts`, `package.json` |
| 11 | Integration test | `mcpIntegration.test.ts` |

**New files:** `mcpConverter.ts`, `mcpWriter.ts`, `mcpConverter.test.ts`, `mcpWriter.test.ts`, `treeView.test.ts`, `mcpIntegration.test.ts`
**Modified files:** `types.ts`, `stateManager.ts`, `localReader.ts`, `treeView.ts`, `importService.ts`, `extension.ts`, `package.json`, existing test files
