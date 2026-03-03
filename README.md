# Copilot Skill Bridge

Bridge Claude Code marketplace skills into GitHub Copilot.

Copilot Skill Bridge discovers skills from local Claude plugin caches and remote GitHub repositories, converts Claude-specific references into Copilot-compatible formats, and writes prompt files that GitHub Copilot can use directly. It also detects skills that rely on Claude-only infrastructure and marks them as incompatible so you only import what actually works.

## Features

- **Skill Discovery** -- Finds skills from your local Claude plugin cache and configurable remote GitHub marketplace repositories. Search GitHub for new marketplaces directly from the command palette.
- **Smart Conversion** -- Applies 31+ transformation rules to translate Claude-specific tool names, file paths, and conventions into Copilot equivalents.
- **Compatibility Analysis** -- Detects skills that require Claude-only infrastructure (sub-agent dispatch, parallel agents, meta-orchestrators) and marks them as incompatible. MCP-dependent skills are allowed when a matching MCP server is available.
- **MCP Server Support** -- Discovers, imports, and manages MCP server configurations from plugins. Writes `.vscode/mcp.json` with proper stdio/HTTP configs and secret input detection.
- **TreeView Sidebar** -- A dedicated activity bar panel groups plugins by marketplace, shows sync status with icons, and provides inline actions and right-click context menus for import/remove. Hover any item for a description tooltip.
- **Bulk Import** -- Import all compatible skills from a plugin in one action with a modal confirmation, progress bar, and error summary.
- **Diff Preview** -- Single skill imports show a side-by-side diff of the original vs. converted content before you accept.
- **Update Watching** -- Periodically checks remote sources for new or updated skills and notifies you when changes are available.
- **Marketplace Search** -- Search GitHub for Claude marketplace repositories with star counts, or enter a repo manually.
- **GitHub Authentication** -- Optionally sign in with GitHub via the VS Code authentication API to access private repositories and increase API rate limits.

## Getting Started

1. **Install** the extension from the VS Code Marketplace.
2. **Add a marketplace** -- Open the Copilot Skill Bridge sidebar and click "Add Marketplace" to search GitHub, or add repos manually in Settings under `copilotSkillBridge.marketplaces`.
3. **Browse skills** -- Expand a marketplace or plugin in the sidebar to see available skills and MCP servers. Incompatible skills are shown with a dimmed icon and reason.
4. **Import skills** -- Click the download icon on any available skill, right-click for more options, or use "Import All Skills" on a plugin node.
5. **Import MCP servers** -- Click the download icon on MCP server nodes, or use "Import All MCP Servers" on the MCP Servers group.
6. **Optionally sign in to GitHub** using the "Sign in to GitHub" command for access to private repos and higher rate limits.

## Output Formats

The extension supports two output formats controlled by `copilotSkillBridge.outputFormats`:

- **`prompts`** (default) -- Generates `.github/prompts/<name>.prompt.md` files. These are invoked on-demand via Copilot `/slash-commands` with zero context overhead until you use them.
- **`instructions`** -- Generates `.github/instructions/<name>.instructions.md` files with an `applyTo: '**/*'` frontmatter. These are automatically loaded by Copilot on every message.

When only `prompts` is selected, the full converted skill content is embedded directly in the prompt file. When both formats are selected, the prompt file is a pointer to the instructions file.

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `copilotSkillBridge.claudeCachePath` | `string` | `~/.claude/plugins/cache` | Path to Claude Code plugin cache directory |
| `copilotSkillBridge.marketplaces` | `string[]` | `["obra/superpowers"]` | GitHub repos to fetch marketplace skills from |
| `copilotSkillBridge.checkInterval` | `number` | `86400` | Remote update check interval in seconds |
| `copilotSkillBridge.autoAcceptUpdates` | `boolean` | `false` | Automatically accept skill updates without prompting |
| `copilotSkillBridge.outputFormats` | `string[]` | `["prompts"]` | Which Copilot file formats to generate (`instructions`, `prompts`, or both) |
| `copilotSkillBridge.generateRegistry` | `boolean` | `true` | Add skill registry to copilot-instructions.md |

## Commands

| Command | Title | Description |
|---------|-------|-------------|
| `copilotSkillBridge.importSkill` | Import Skill | Import a single skill with diff preview |
| `copilotSkillBridge.importAllSkills` | Import All Skills | Bulk import all compatible skills from a plugin |
| `copilotSkillBridge.checkForUpdates` | Check for Updates | Refresh all sources for skill and MCP server updates |
| `copilotSkillBridge.addMarketplace` | Add Marketplace | Search GitHub for marketplace repos or enter one manually |
| `copilotSkillBridge.removeSkill` | Remove Skill | Remove an imported skill from your workspace |
| `copilotSkillBridge.rebuildRegistry` | Rebuild Registry | Rebuild the skill registry in copilot-instructions.md |
| `copilotSkillBridge.login` | Sign in to GitHub | Authenticate with GitHub for private repo access |
| `copilotSkillBridge.importMcpServer` | Import MCP Server | Import a single MCP server configuration |
| `copilotSkillBridge.importAllMcpServers` | Import All MCP Servers | Import all MCP servers from a plugin |
| `copilotSkillBridge.removeMcpServer` | Remove MCP Server | Remove an imported MCP server configuration |

## How It Works

Claude Code skills use Claude-specific tool names, file paths, and conventions that GitHub Copilot does not understand. Copilot Skill Bridge:

1. **Discovers** plugins from your local Claude cache and remote GitHub marketplace repos.
2. **Analyzes** each skill for compatibility -- skills requiring sub-agent dispatch, parallel agents, or meta-orchestrator patterns are flagged as incompatible. MCP-dependent skills (e.g. memory tools) are allowed when a matching server is available from the plugin, your workspace, or the system.
3. **Converts** compatible skills by applying 31+ regex transformation rules (e.g. `TodoWrite` -> task checklist, `CLAUDE.md` -> `.github/copilot-instructions.md`, `superpowers:skill-name` -> instruction file references).
4. **Writes** the converted content as `.github/prompts/*.prompt.md` and/or `.github/instructions/*.instructions.md` files. An optional registry block is appended to `copilot-instructions.md` so Copilot knows which skills are available.
5. **Manages** MCP server configurations by converting Claude's `.mcp.json` format into VS Code's `.vscode/mcp.json` format, with automatic secret input detection for environment variables.

## License

MIT
