# Smart Skill Conversion Design

## Problem

Skills imported from Claude Code plugins (e.g., obra/superpowers) contain constructs that don't translate to VS Code Copilot:

1. **Tool references** — `Skill tool`, `Agent tool`, `TodoWrite`, `AskUserQuestion` have no Copilot equivalents
2. **Sub-agent architecture** — dispatching parallel agents, subtask spawning requires Claude Code infrastructure
3. **MCP dependencies** — `search_memory`/`save_memory` need an MCP server that may or may not be available
4. **Meta-orchestration** — `using-superpowers` acts as a skill loader; Copilot has no equivalent mechanism
5. **Context bloat** — all instruction files with `applyTo: '**/*'` load into every conversation (~15K+ words)

The current converter handles surface-level text replacements (13 regex rules) but doesn't detect or filter architecturally incompatible skills.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Incompatible skills | Filter out with warning | Keep workspace clean; don't import skills that can't function |
| Loading model | Prompts only (default) | Mirrors Claude's on-demand Skill tool; zero context overhead until /invoked |
| Prompt format | Full content in .prompt.md | Self-contained; no pointer indirection |
| Output format setting | User chooses: prompts, instructions, or both | Backward-compatible; default changes to prompts-only |
| Detection method | Static keyword scoring | Works on any skill without upstream changes; testable |
| MCP dependencies | Resolve against available servers | If plugin ships MCP server or one is already configured, dependency is satisfied |
| Tree view | Show incompatible with badge | Users see what's filtered and why |

## 1. Compatibility Analyzer

New module `src/compatAnalyzer.ts`.

### Interface

```typescript
interface CompatResult {
    compatible: boolean;
    issues: string[];           // human-readable blocking reasons
    mcpDependencies: string[];  // MCP servers that would resolve issues
}

function analyzeCompatibility(
    skill: SkillInfo,
    availableMcpServers: McpServerInfo[],
    importedMcpServers: Record<string, McpServerRecord>,
    systemMcpServers: Record<string, any>
): CompatResult;
```

### Blocking Patterns

Hard blockers — each pattern found adds an issue:

| Pattern | Reason |
|---------|--------|
| `dispatch.*subtask`, `spawn.*agent`, `parallel.*agent` | Requires Claude Code sub-agent architecture |
| `AskUserQuestion` | No equivalent interactive tool in Copilot |
| Content is primarily a meta-orchestrator (heuristic: references "check skills before every response" or "invoke.*skill.*before.*any.*response") | No skill-loading mechanism in Copilot |

### MCP-Resolvable Patterns

These are initially flagged but resolved if an MCP server is available:

| Pattern | MCP Dependency |
|---------|---------------|
| `search_memory`, `save_memory` | Memory MCP server |
| `mcp_tool_name` pattern matches | Corresponding MCP server |

### Resolution Logic

1. Scan skill content for all blocking and MCP-resolvable patterns
2. For MCP-resolvable patterns, check if a matching server exists in:
   - The same plugin's `mcpServers[]`
   - Already-imported servers in `.copilot-skill-bridge.json`
   - Existing servers in `.vscode/mcp.json`
3. Satisfied MCP dependencies are removed from issues
4. `compatible = issues.length === 0`

## 2. Full-Content Prompt Files

### New Generator

```typescript
function generateFullPromptFile(name: string, description: string, convertedBody: string): string;
```

Produces:

```markdown
---
name: brainstorming
description: Explore ideas and create designs through collaborative dialogue
agent: agent
---

[full converted skill body]
```

### Changes to writeSkillFiles

When `outputFormats` includes `'prompts'`:
- Use `generateFullPromptFile` instead of the current pointer-style `generatePromptFile`
- Write to `.github/prompts/{name}.prompt.md`

The existing `generatePromptFile` (pointer-style) remains available for backward compatibility but is no longer the default.

## 3. Output Format Setting

### Current

```json
"copilotSkillBridge.outputFormats": {
    "default": ["instructions", "prompts"]
}
```

### New Default

```json
"copilotSkillBridge.outputFormats": {
    "default": ["prompts"]
}
```

Valid values remain: `"instructions"`, `"prompts"`, or both. Existing users who configured the setting explicitly keep their choice.

## 4. Tree View — Incompatible Badge

### New Status

Add `'incompatible'` to `SkillStatus`:

```typescript
type SkillStatus = 'synced' | 'available' | 'update-available' | 'conflict' | 'incompatible';
```

### Display

- Icon: `$(circle-slash)` with muted color
- Description: first issue reason (e.g., "requires sub-agent dispatch")
- Context value: `skill-incompatible` — no import action in context menu

### Integration

In `getPluginChildren`, run the compatibility analyzer on each skill. Set status to `'incompatible'` when `compatible === false`.

## 5. Import Flow Changes

### Single Skill Import

1. Run compatibility check before diff preview
2. If incompatible → `showWarningMessage` with reasons, skip import
3. If compatible with MCP dependency → offer to import MCP server alongside
4. If fully compatible → proceed as today

### Bulk Import

1. Run compatibility check on all skills
2. Partition into compatible and incompatible lists
3. Modal shows: `Import N skill(s) (M incompatible, skipped): skill-a, skill-b...`
4. Only import compatible skills
5. Result summary includes skip count

## Files to Modify

| File | Change |
|------|--------|
| `src/compatAnalyzer.ts` | **New** — compatibility scoring with MCP awareness |
| `src/converter.ts` | Add `generateFullPromptFile` function |
| `src/importService.ts` | Compatibility gate in `importSkill` and `importAllSkills` |
| `src/treeView.ts` | `incompatible` status display, analyzer integration |
| `src/fileWriter.ts` | Update `writePromptFile` to accept full content |
| `src/types.ts` | Add `'incompatible'` to `SkillStatus` |
| `package.json` | Change `outputFormats` default to `['prompts']` |
| `src/test/unit/compatAnalyzer.test.ts` | **New** — analyzer tests |
| `src/test/unit/converter.test.ts` | Tests for `generateFullPromptFile` |
| `src/test/unit/treeView.test.ts` | Tests for incompatible badge |
| `src/test/unit/importService.test.ts` | Tests for compatibility gate |

## Verification

1. `npm run compile` — no TypeScript errors
2. `npm run test:unit` — all tests pass
3. `npm run lint` — clean
4. Manual: import a compatible skill → works as before via /slash-command
5. Manual: import an incompatible skill → warning shown, import skipped
6. Manual: import a skill with MCP dependency + available server → imports both
7. Manual: tree view shows incompatible badge on blocked skills
