# MCP Server Bridge Support — Design Document

**Goal:** Bridge MCP server definitions from Claude plugin caches into VS Code's `.vscode/mcp.json` format, enabling one-click import of MCP servers alongside skills.

**Architecture:** Thin bridge — discover `.mcp.json` files in plugin cache directories, convert Claude format to VS Code format via pure functions, merge into workspace `.vscode/mcp.json` with conflict-safe strategy.

**Tech Stack:** VS Code extension API, JSON read/write via `vscode.workspace.fs`, existing ImportService orchestrator.

---

## 1. MCP Server Discovery

**New interface** in `types.ts`:

```typescript
interface McpServerInfo {
    name: string;
    config: ClaudeMcpServerConfig;  // raw config from .mcp.json
    pluginName: string;
    pluginVersion: string;
    marketplace: string;
}

interface ClaudeMcpServerConfig {
    command?: string;       // stdio transport
    args?: string[];
    env?: Record<string, string>;
    url?: string;           // http transport
}
```

**Discovery** happens during existing plugin scanning in `pluginScanner.ts`:

- After reading skills from a plugin directory, also check for `.mcp.json` in the same directory
- Parse it: flat object `{ "server-name": { command, args, env, url } }`
- Attach parsed servers to `PluginInfo` as `mcpServers: McpServerInfo[]`
- If `.mcp.json` is missing or malformed, `mcpServers` is empty array (no error)

## 2. Format Conversion

**New file:** `mcpConverter.ts`

**Pure function:** `convertMcpConfig(servers: McpServerInfo[]) → VsCodeMcpConfig`

```typescript
interface VsCodeMcpConfig {
    servers: Record<string, VsCodeMcpServerEntry>;
    inputs: VsCodeInput[];
}

interface VsCodeMcpServerEntry {
    type: 'stdio' | 'sse';
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
}

interface VsCodeInput {
    id: string;
    type: 'promptString';
    description: string;
    password: boolean;
}
```

**Conversion rules:**

| Claude field | VS Code field |
|---|---|
| `command` + `args` | `type: "stdio"`, `command`, `args` |
| `url` | `type: "sse"`, `url` |
| `env` values | Copied; secret patterns detected and replaced |

**Secret detection:** Scan `env` values for patterns like `${...}`, `sk-*`, `key-*`, or all-caps names containing `KEY`, `SECRET`, `TOKEN`, `PASSWORD`. Detected secrets are:
- Replaced in env with `${input:pluginName-serverName-VARNAME}`
- Added to `inputs` array with `password: true`

## 3. MCP Config Writer & Merge Logic

**New file:** `mcpWriter.ts`

**Responsibilities:**
- Read existing `.vscode/mcp.json` (or create empty)
- Merge bridge-managed servers into existing config
- Write back to `.vscode/mcp.json`

**Pure merge function:** `mergeMcpConfigs(existing: object, incoming: VsCodeMcpConfig, manifestEntries: string[]) → object`

**Merge strategy:**

| Scenario | Action |
|---|---|
| New server (not in file) | Add it |
| Existing bridge-managed server (in manifest) | Update it |
| Existing user-added server (not in manifest) | Skip — never touch |
| Removal of bridge-managed server | Remove from file + manifest |

**Inputs merge:** Append new inputs, skip duplicates by `id`, never remove user-added inputs.

**Manifest extension** in `types.ts`:

```typescript
interface BridgeManifest {
    skills: Record<string, SkillRecord>;
    mcpServers: Record<string, McpServerRecord>;  // NEW
    marketplaces: string[];
    settings: ManifestSettings;
}

interface McpServerRecord {
    source: string;       // "pluginName@marketplace"
    importedAt: string;
}
```

## 4. TreeView Integration

MCP servers appear as a separate collapsible group under each plugin:

```
COPILOT SKILL BRIDGE
├── superpowers (v4.3.1)
│   ├── brainstorming          [imported]
│   ├── test-driven-development
│   ├── MCP Servers
│   │   ├── context7           [imported]
│   │   └── playwright
│   └── ...
```

**Implementation in `treeView.ts`:**

- New `TreeItemType` values: `mcpGroup` (folder node), `mcpServer` (leaf node)
- `mcpGroup` only appears when `plugin.mcpServers.length > 0`
- `mcpServer` nodes show import status via icon
- Context menus:
  - On `mcpServer`: "Import MCP Server" / "Remove MCP Server"
  - On `mcpGroup`: "Import All MCP Servers"

## 5. Import Flow Integration

**MCP import path (parallel to skill import):**

1. User triggers import from TreeView or command
2. `ImportService.importMcpServer(server: McpServerInfo)`:
   - Calls `convertMcpConfig()` for single server
   - Calls `mcpWriter.mergeMcpConfig()` to read/merge/write
   - Records in manifest `mcpServers`
   - Refreshes TreeView
3. `ImportService.importAllMcpServers(plugin: PluginInfo)`:
   - Iterates all `plugin.mcpServers`
   - Calls `importMcpServer()` for each
4. Removal: `ImportService.removeMcpServer(name)`:
   - Removes from `.vscode/mcp.json` (only if bridge-managed)
   - Removes manifest entry
   - Refreshes TreeView

**Extended commands:**

| Command | Behavior |
|---|---|
| `importAllSkills` (existing) | Also imports all MCP servers from the plugin |
| `importAllMcpServers` (new) | Imports all MCP servers from a selected plugin |
| `importMcpServer` (new) | Imports a single MCP server |
| `removeMcpServer` (new) | Removes a single bridge-managed MCP server |

## 6. Error Handling

| Scenario | Behavior |
|---|---|
| `.mcp.json` malformed in plugin | Log warning, skip, don't block skill import |
| `.vscode/mcp.json` doesn't exist | Create with `{ "servers": {} }` |
| `.vscode/mcp.json` is malformed | Show error, refuse to overwrite (protect user data) |
| Command doesn't exist locally | Import anyway, show info message |
| Secret variables detected | Show info listing placeholders user needs to fill |

## 7. Testing Strategy

- **`mcpConverter.test.ts`**: stdio/http conversion, secret detection, edge cases (no env, empty args, nested secrets)
- **`mcpWriter.test.ts`**: merge logic — add new, update existing, skip user-added, removal, create-from-scratch, malformed input
- **`treeView.test.ts`**: MCP group/server nodes render, context menus
- **Integration test**: full flow — discover plugin with MCP servers → import → verify `.vscode/mcp.json` → remove → verify cleanup

All core logic is pure functions, so highly testable without filesystem mocks.
