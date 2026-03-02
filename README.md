# Copilot Skill Bridge

Bridge Claude Code marketplace skills into GitHub Copilot.

Copilot Skill Bridge discovers skills from local Claude plugin caches and remote GitHub repositories, converts Claude-specific references into Copilot-compatible formats using 31+ transformation rules, and writes instruction and prompt files that GitHub Copilot can use directly.

## Features

- **Skill Discovery** -- Automatically finds skills from your local Claude plugin cache and configurable remote GitHub marketplace repositories.
- **Conversion Engine** -- Applies 31+ transformation rules to translate Claude-specific syntax, tool names, and conventions into Copilot equivalents.
- **TreeView Sidebar** -- A dedicated activity bar panel lets you browse discovered skills, see their sync status, and import or remove them with a click.
- **Update Watching** -- Periodically checks remote sources for new or updated skills and notifies you when changes are available.
- **GitHub Authentication** -- Optionally sign in with GitHub via the VS Code authentication API to access private repositories and increase API rate limits.

## Getting Started

1. **Install** the extension from the VS Code Marketplace.
2. **Configure marketplace repositories** by opening Settings and adding GitHub repos to `copilotSkillBridge.marketplaces` (e.g., `obra/superpowers`).
3. **Import skills** from the Copilot Skill Bridge sidebar -- click the download icon on any available skill, or use the "Import All Skills" command.
4. **Optionally sign in to GitHub** using the "Sign in to GitHub" command for access to private repos and higher rate limits.

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `copilotSkillBridge.claudeCachePath` | `string` | `~/.claude/plugins/cache` | Path to Claude Code plugin cache directory |
| `copilotSkillBridge.marketplaces` | `string[]` | `["obra/superpowers"]` | GitHub repos to fetch marketplace skills from |
| `copilotSkillBridge.checkInterval` | `number` | `86400` | Remote update check interval in seconds |
| `copilotSkillBridge.autoAcceptUpdates` | `boolean` | `false` | Automatically accept skill updates without prompting |
| `copilotSkillBridge.outputFormats` | `string[]` | `["instructions", "prompts"]` | Which Copilot file formats to generate |
| `copilotSkillBridge.generateRegistry` | `boolean` | `true` | Add skill registry to copilot-instructions.md |

## Commands

| Command | Title | Description |
|---------|-------|-------------|
| `copilotSkillBridge.importSkill` | Import Skill | Import a single skill into your workspace |
| `copilotSkillBridge.importAllSkills` | Import All Skills | Import all available skills at once |
| `copilotSkillBridge.checkForUpdates` | Check for Updates | Check remote sources for skill updates |
| `copilotSkillBridge.addMarketplace` | Add Marketplace | Add a new GitHub repository as a skill source |
| `copilotSkillBridge.removeSkill` | Remove Skill | Remove an imported skill from your workspace |
| `copilotSkillBridge.rebuildRegistry` | Rebuild Registry | Rebuild the skill registry in copilot-instructions.md |
| `copilotSkillBridge.login` | Sign in to GitHub | Authenticate with GitHub for private repo access |

## How It Works

Claude Code skills use Claude-specific tool names, file paths, and conventions that GitHub Copilot does not understand. Copilot Skill Bridge reads these skill definitions, applies a set of 31+ conversion rules to rewrite references (for example, replacing `claude` tool invocations with Copilot equivalents, adjusting file paths, and normalizing prompt formats), and writes the result as `.github/copilot-instructions.md` and `.github/prompts/*.prompt.md` files in your workspace. An optional registry block is appended to `copilot-instructions.md` so Copilot knows which skills are available.

## License

MIT
