# Copilot Skill Bridge

Bridge Claude Code marketplace skills into GitHub Copilot.

Copilot Skill Bridge discovers skills from local Claude plugin caches and remote GitHub repositories, converts Claude-specific references into Copilot-compatible formats, and writes prompt files that GitHub Copilot can use directly. It also detects skills that rely on Claude-only infrastructure and marks them as incompatible so you only import what actually works.

## Features

- **Skill Discovery** -- Finds skills from your local Claude plugin cache and configurable remote GitHub marketplace repositories. Transitive dependency resolution follows marketplace `dependencies` and `source.url` redirects automatically via BFS with cycle detection. Search GitHub for new marketplaces directly from the command palette.
- **Progressive Loading** -- Local plugins appear immediately in the sidebar. Remote plugins render incrementally as each marketplace completes fetching, with a spinner indicating progress. Parallel API calls within each repo keep load times fast.
- **Smart Conversion** -- Applies 27 transformation rules to translate Claude-specific tool names, CLI commands, file paths, and conventions into Copilot equivalents. Converts `claude mcp add`, `claude install`, and `claude plugin install` commands. MCP tool references are preserved as-is.
- **Companion Files** -- Skills with additional `.md` files alongside `SKILL.md` (e.g., visual criteria, code quality rules) are discovered and imported automatically. Cross-references in skill content are rewritten to point to the imported companion files.
- **Dependency Resolution** -- When importing a skill, cross-plugin skill dependencies and MCP server requirements are detected and offered for auto-install. Bulk imports resolve dependencies across all selected skills.
- **Compatibility Analysis** -- Detects skills that require Claude-only infrastructure (sub-agent dispatch, parallel agents) and marks them as incompatible. Meta-orchestrator skills are allowed since `copilot-instructions.md` serves this role. MCP-dependent skills are allowed when a matching MCP server is available.
- **Always Active Skills** -- Mark any imported skill as "always active" to write it as a `.github/instructions/<name>.instructions.md` file with `applyTo: '**/*'`, so Copilot loads it on every message. Useful for generic skills like long-term memory that should always be available.
- **Skill Preview** -- Click any skill in the sidebar to view its content in a read-only editor. Imports and updates show a modal confirmation before writing.
- **MCP Server Support** -- Discovers MCP server configurations from `plugin.json` (inline object configs or string path references) with `.mcp.json` fallback. Writes `.vscode/mcp.json` with proper stdio/HTTP configs and secret input detection.
- **TreeView Sidebar** -- A dedicated activity bar panel groups plugins by marketplace, shows sync status with icons, and provides inline actions and right-click context menus for import/remove/embed. Hover any item for a description tooltip. Click "Open Source Repository" to visit a marketplace or plugin on GitHub.
- **Bulk Import / Remove** -- Import or remove all compatible skills and MCP servers from a plugin or marketplace in one action with modal confirmation, progress bar, and error summary.
- **Update Watching** -- Periodically checks remote sources for new or updated skills and notifies you when changes are available.
- **Marketplace Search** -- Search GitHub for Claude marketplace repositories with star counts, or enter a repo manually.
- **GitHub Authentication** -- Optionally sign in with GitHub via the VS Code authentication API to access private repositories and increase API rate limits.
- **LM-Enhanced Conversion** -- Optionally use the Copilot Language Model API for deeper semantic conversion beyond regex rules.

## Getting Started

1. **Install** the extension from the VS Code Marketplace.
2. **Add a marketplace** -- Open the Copilot Skill Bridge sidebar and click "Add Marketplace" to search GitHub, or add repos manually in Settings under `copilotSkillBridge.marketplaces`.
3. **Browse skills** -- Expand a marketplace or plugin in the sidebar to see available skills and MCP servers. Incompatible skills are shown with a dimmed icon and reason.
4. **Preview skills** -- Click any skill in the sidebar to view its content before importing.
5. **Import skills** -- Click the download icon on any available skill, right-click for more options, or use "Import All Skills" on a plugin node.
6. **Make skills always active** -- Right-click an imported skill and choose "Embed in Instructions" to write it as an always-active instructions file.
7. **Import MCP servers** -- Click the download icon on MCP server nodes, or use "Import All MCP Servers" on the MCP Servers group.
8. **Optionally sign in to GitHub** using the "Sign in to GitHub" command for access to private repos and higher rate limits.

## Output Formats

The extension supports two output formats controlled by `copilotSkillBridge.outputFormats`:

- **`prompts`** (default) -- Generates `.github/prompts/<name>.prompt.md` files. These are invoked on-demand via Copilot `/slash-commands` with zero context overhead until you use them.
- **`instructions`** -- Generates `.github/instructions/<name>.instructions.md` files with an `applyTo: '**/*'` frontmatter. These are automatically loaded by Copilot on every message.

When only `prompts` is selected, the full converted skill content is embedded directly in the prompt file. When both formats are selected, the prompt file is a pointer to the instructions file.

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `copilotSkillBridge.claudeCachePath` | `string` | `~/.claude/plugins/cache` | Path to Claude Code plugin cache directory |
| `copilotSkillBridge.marketplaces` | `string[]` | `[]` | GitHub repos to fetch marketplace skills from |
| `copilotSkillBridge.checkInterval` | `number` | `86400` | Remote update check interval in seconds |
| `copilotSkillBridge.autoAcceptUpdates` | `boolean` | `false` | Automatically accept skill updates without prompting |
| `copilotSkillBridge.outputFormats` | `string[]` | `["prompts"]` | Which Copilot file formats to generate (`instructions`, `prompts`, or both) |
| `copilotSkillBridge.generateRegistry` | `boolean` | `true` | Add skill registry to copilot-instructions.md |
| `copilotSkillBridge.useLmConversion` | `boolean` | `true` | Use Copilot Language Model API for deeper semantic conversion |

## Commands

| Command | Title | Description |
|---------|-------|-------------|
| `copilotSkillBridge.importSkill` | Import Skill | Import a single skill with modal confirmation and dependency resolution |
| `copilotSkillBridge.updateSkill` | Update Skill | Update an imported skill to the latest version with modal confirmation |
| `copilotSkillBridge.importAllSkills` | Import All Skills | Bulk import all compatible skills from a plugin |
| `copilotSkillBridge.checkForUpdates` | Check for Updates | Refresh all sources for skill and MCP server updates |
| `copilotSkillBridge.addMarketplace` | Add Marketplace | Search GitHub for marketplace repos or enter one manually |
| `copilotSkillBridge.removeSkill` | Remove Skill | Remove an imported skill from your workspace |
| `copilotSkillBridge.removeMarketplace` | Remove Marketplace | Remove a marketplace and all its imported skills |
| `copilotSkillBridge.rebuildRegistry` | Rebuild Registry | Rebuild the skill registry in copilot-instructions.md |
| `copilotSkillBridge.login` | Sign in to GitHub | Authenticate with GitHub for private repo access |
| `copilotSkillBridge.importMcpServer` | Import MCP Server | Import a single MCP server configuration |
| `copilotSkillBridge.importAllMcpServers` | Import All MCP Servers | Import all MCP servers from a plugin |
| `copilotSkillBridge.removeMcpServer` | Remove MCP Server | Remove an imported MCP server configuration |
| `copilotSkillBridge.showSkillContent` | Show Skill Content | View a skill's content in a read-only editor |
| `copilotSkillBridge.openSourceRepo` | Open Source Repository | Open the marketplace or plugin repository on GitHub |
| `copilotSkillBridge.embedSkill` | Embed in Instructions | Make a skill always active via an instructions file |
| `copilotSkillBridge.unembedSkill` | Unembed from Instructions | Remove the always-active instructions file for a skill |
| `copilotSkillBridge.removeAllSkills` | Remove All from Project | Remove all imported skills and MCP servers from a plugin |
| `copilotSkillBridge.removeAllFromMarketplace` | Remove All from Project | Remove all imported skills and MCP servers from a marketplace |

## How It Works

Claude Code skills use Claude-specific tool names, file paths, and conventions that GitHub Copilot does not understand. Copilot Skill Bridge:

1. **Discovers** plugins from your local Claude cache and remote GitHub marketplace repos. Marketplace dependencies and `source.url` redirects are resolved transitively via BFS with cycle detection, so a single marketplace entry can pull in an entire ecosystem of plugins. Skills and their companion `.md` files are fetched in parallel for fast loading.
2. **Analyzes** each skill for compatibility -- skills requiring sub-agent dispatch or parallel agents are flagged as incompatible. Meta-orchestrator skills are allowed (`copilot-instructions.md` serves this role). MCP-dependent skills (e.g. memory tools) are allowed when a matching server is available from the plugin, your workspace, or the system.
3. **Converts** compatible skills by applying 27 regex transformation rules (e.g. `TodoWrite` -> task checklist, `claude mcp add` -> VS Code config, `CLAUDE.md` -> `.github/copilot-instructions.md`, `superpowers:skill-name` -> instruction file references). Optionally passes through the Copilot Language Model API for deeper semantic conversion.
4. **Resolves** cross-plugin skill dependencies and MCP server requirements, offering auto-install of missing dependencies before writing.
5. **Writes** the converted content as `.github/prompts/*.prompt.md` and/or `.github/instructions/*.instructions.md` files, including companion files. A slim registry table is appended to `copilot-instructions.md` with skill names and file paths, so Copilot knows which skills are available. The registry references the correct file paths based on your configured output format.
6. **Manages** MCP server configurations by discovering them from `plugin.json` (inline objects or string path references) with `.mcp.json` fallback, and converting to VS Code's `.vscode/mcp.json` format with automatic secret input detection for environment variables.

## License

MIT
