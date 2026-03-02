# Copilot Skill Bridge — Design Document

**Date:** 2026-03-02
**Status:** Approved

## Overview

A VS Code extension that bridges Claude Code marketplace skills into GitHub Copilot by converting and managing them as Copilot instruction/prompt files within the user's project.

### Core Flow

```
Claude Marketplace (local cache + GitHub repos)
        │
        ▼
   Skill Discovery (TreeView sidebar)
        │
        ▼
   Auto-Conversion Engine (strip Claude-specific refs)
        │
        ▼
   Preview Diff → User accepts/rejects
        │
        ▼
   Write to project:
     ├── .github/instructions/<skill>.instructions.md
     ├── .github/prompts/<skill>.prompt.md
     └── .github/copilot-instructions.md (skill registry section)
        │
        ▼
   Update Watcher (cache changes + remote version checks)
        │
        ▼
   Notification → "Skill X updated, rewrite?" → Preview → Accept/Reject
```

---

## 1. Skill Discovery

### Sources

**Local source:** `~/.claude/plugins/cache/` directory
- Reads each `<marketplace>/<plugin>/<version>/.claude-plugin/plugin.json` for metadata
- Reads each `skills/*/SKILL.md` for frontmatter (name, description) and content
- Detects installed version from directory structure

**Remote source:** GitHub repos
- User configures marketplace repos (e.g. `obra/superpowers`) in extension settings
- Fetches `.claude-plugin/marketplace.json` via GitHub API to list available plugins
- Fetches `plugin.json` for metadata and individual `SKILL.md` files on demand
- Caches fetched content locally to avoid repeated API calls

### TreeView Sidebar

```
COPILOT SKILL BRIDGE
├── 📦 superpowers (v4.3.1) [local + remote]
│   ├── ✅ brainstorming          (synced)
│   ├── ✅ test-driven-development (synced)
│   ├── ⬇️  systematic-debugging   (available, not imported)
│   ├── ⚠️  writing-plans          (update available)
│   └── ...
├── 📦 some-other-plugin (v1.0.0) [remote only]
│   ├── ⬇️  skill-a
│   └── ⬇️  skill-b
└── ➕ Add Marketplace...
```

**Status icons:**
- ✅ Synced — imported and up to date
- ⬇️ Available — not yet imported
- ⚠️ Update available — source changed since last import
- ❌ Conflict — local edits would be overwritten

---

## 2. Conversion Engine

Each skill produces up to 3 outputs:

### Output: Instructions File

`.github/instructions/<skill>.instructions.md`

```yaml
---
name: 'Brainstorming'
description: 'Explores user intent, requirements and design before implementation'
applyTo: '**/*'
---
# Brainstorming Ideas Into Designs
[converted content here]
```

### Output: Prompt File

`.github/prompts/<skill>.prompt.md`

```yaml
---
name: brainstorming
description: Explores user intent, requirements and design before implementation
agent: agent
---
[converted content here]
```

### Output: Registry Entry

Appended to `.github/copilot-instructions.md`:

```markdown
## Available Skills
When working on tasks, consult these skill files for guidance:

| Skill | Trigger | File |
|-------|---------|------|
| brainstorming | Before any creative work — features, components, new functionality | .github/instructions/brainstorming.instructions.md |
| test-driven-development | Before writing implementation code for any feature or bugfix | .github/instructions/test-driven-development.instructions.md |
| systematic-debugging | When encountering bugs, test failures, or unexpected behavior | .github/instructions/systematic-debugging.instructions.md |
```

### Auto-Conversion Rules

| Claude Reference | Converted To |
|---|---|
| `TodoWrite` tool references | "Create a checklist and track progress" |
| `Agent` / `subagent` tool calls | "Break into subtasks and handle sequentially" |
| `Skill` tool invocations | "Refer to the [skill-name] instructions file at .github/instructions/" |
| `Read`, `Edit`, `Write`, `Grep`, `Glob` tool refs | Generic equivalents ("read the file", "search the codebase") |
| `EnterPlanMode` / `ExitPlanMode` | "Present your plan to the user for approval" |
| `CLAUDE.md` references | `.github/copilot-instructions.md` |
| `~/.claude/` paths | Removed or genericized |
| Graphviz `dot` diagrams | Kept as-is (readable as pseudocode) |
| Superpowers skill cross-references (`superpowers:skill-name`) | Rewritten to relative file links |

**Preserved as-is:** Checklists, process flows, principles, anti-patterns, section structure, language-agnostic code examples.

**Preview step:** Before writing, the extension shows a diff view comparing the original Claude skill with the converted output. User accepts, rejects, or edits manually.

---

## 3. Update Watcher

### Triggers

**1. Local cache watcher** — `vscode.workspace.createFileSystemWatcher`
- Watches `~/.claude/plugins/cache/**/SKILL.md` for changes
- Fires when Claude Code updates a plugin
- Immediate detection, no polling

**2. Remote version checker** — periodic poll
- Checks configured GitHub repos for new commits/tags on a configurable interval (default: 24h)
- Uses GitHub API `GET /repos/{owner}/{repo}/releases/latest` or commit SHA comparison
- Also triggered manually via "Check for Updates" button in TreeView
- Respects GitHub API rate limits (conditional requests with `If-None-Match`)

### Update Flow

```
Change detected (local watcher or remote poll)
    │
    ▼
Compare source hash with last-imported hash
    │
    ├── No change → silent, do nothing
    │
    └── Changed →
        ├── No local edits → notification:
        │   "⚠️ Skill 'brainstorming' updated. Review changes?"
        │   [Review] [Skip] [Auto-accept all]
        │
        └── Has local edits → conflict notification:
            "⚠️ Skill 'brainstorming' updated, but you have local changes."
            [Show Diff] [Keep Mine] [Accept Theirs] [Merge]
```

### State Tracking

`.github/.copilot-skill-bridge.json`:

```json
{
  "skills": {
    "brainstorming": {
      "source": "superpowers@superpowers-marketplace",
      "sourceHash": "a1b2c3...",
      "importedHash": "d4e5f6...",
      "importedAt": "2026-03-02T10:00:00Z",
      "locallyModified": false
    }
  },
  "marketplaces": [
    { "repo": "obra/superpowers", "lastChecked": "2026-03-02T08:00:00Z" }
  ],
  "settings": {
    "checkInterval": 86400,
    "autoAcceptUpdates": false
  }
}
```

---

## 4. Extension Settings & Commands

### Settings

```json
{
  "copilotSkillBridge.claudeCachePath": "~/.claude/plugins/cache",
  "copilotSkillBridge.marketplaces": ["obra/superpowers"],
  "copilotSkillBridge.checkInterval": 86400,
  "copilotSkillBridge.autoAcceptUpdates": false,
  "copilotSkillBridge.outputFormats": ["instructions", "prompts"],
  "copilotSkillBridge.generateRegistry": true
}
```

### Commands

| Command | Description |
|---|---|
| `Copilot Skill Bridge: Import Skill` | Pick a skill from TreeView and import |
| `Copilot Skill Bridge: Import All Skills` | Import all available skills from a plugin |
| `Copilot Skill Bridge: Check for Updates` | Manual remote version check |
| `Copilot Skill Bridge: Add Marketplace` | Add a GitHub repo as a skill source |
| `Copilot Skill Bridge: Remove Skill` | Remove an imported skill's Copilot files |
| `Copilot Skill Bridge: Rebuild Registry` | Regenerate skill registry in copilot-instructions.md |

### Tech Stack

- TypeScript + VS Code Extension API
- `vscode.workspace.fs` for all file operations
- `@octokit/rest` or raw `fetch` for GitHub API
- `vscode.FileSystemWatcher` for local cache monitoring
- No external dependencies beyond that
