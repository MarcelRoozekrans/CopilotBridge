# Smart Skill Conversion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Filter incompatible Claude Code skills, generate full-content prompt files, and default to prompt-only output.

**Architecture:** New `compatAnalyzer.ts` module scores skills against blocking patterns with MCP-awareness. Converter gains `generateFullPromptFile`. Import service gates on compatibility. Tree view shows incompatible badge.

**Tech Stack:** TypeScript, VS Code Extension API, Mocha/assert for tests.

---

### Task 1: Add `'incompatible'` to SkillStatus type

**Files:**
- Modify: `src/types.ts:1`

**Step 1: Write the failing test**

No test needed — type-only change. Verified by compilation.

**Step 2: Update the type**

In `src/types.ts`, change line 1 from:

```typescript
export type SkillStatus = 'synced' | 'available' | 'update-available' | 'conflict';
```

to:

```typescript
export type SkillStatus = 'synced' | 'available' | 'update-available' | 'conflict' | 'incompatible';
```

**Step 3: Verify compilation**

Run: `npm run compile`
Expected: PASS (no errors)

**Step 4: Commit**

```bash
git add src/types.ts
git commit -m "feat: add incompatible to SkillStatus type"
```

---

### Task 2: Create compatibility analyzer with tests

**Files:**
- Create: `src/compatAnalyzer.ts`
- Create: `src/test/unit/compatAnalyzer.test.ts`

**Step 1: Write the failing tests**

Create `src/test/unit/compatAnalyzer.test.ts`:

```typescript
import * as assert from 'assert';
import { analyzeCompatibility, CompatResult } from '../../compatAnalyzer';
import { SkillInfo, McpServerInfo, McpServerRecord } from '../../types';

function makeSkill(content: string, overrides: Partial<SkillInfo> = {}): SkillInfo {
    return {
        name: 'test-skill',
        description: 'test',
        content,
        pluginName: 'test-plugin',
        pluginVersion: '1.0.0',
        marketplace: 'test/repo',
        source: 'local',
        ...overrides,
    };
}

function makeMcpServer(name: string): McpServerInfo {
    return { name, config: { command: 'npx' }, pluginName: 'test', pluginVersion: '1.0.0', marketplace: 'test' };
}

describe('analyzeCompatibility', () => {
    it('should mark skill as compatible when no blocking patterns', () => {
        const skill = makeSkill('Use TDD to write tests. Follow the checklist.');
        const result = analyzeCompatibility(skill, [], {}, {});
        assert.strictEqual(result.compatible, true);
        assert.strictEqual(result.issues.length, 0);
    });

    it('should detect sub-agent dispatch pattern', () => {
        const skill = makeSkill('Dispatch a subtask for each file. Spawn agent per task.');
        const result = analyzeCompatibility(skill, [], {}, {});
        assert.strictEqual(result.compatible, false);
        assert.ok(result.issues.some(i => i.includes('sub-agent')));
    });

    it('should detect parallel agent pattern', () => {
        const skill = makeSkill('Launch parallel agents to handle independent work.');
        const result = analyzeCompatibility(skill, [], {}, {});
        assert.strictEqual(result.compatible, false);
    });

    it('should detect AskUserQuestion pattern', () => {
        const skill = makeSkill('Use AskUserQuestion to get user preference.');
        const result = analyzeCompatibility(skill, [], {}, {});
        assert.strictEqual(result.compatible, false);
        assert.ok(result.issues.some(i => i.includes('AskUserQuestion')));
    });

    it('should detect meta-orchestrator pattern', () => {
        const skill = makeSkill('Check skills before every response. Invoke skill before any response.');
        const result = analyzeCompatibility(skill, [], {}, {});
        assert.strictEqual(result.compatible, false);
        assert.ok(result.issues.some(i => i.includes('meta-orchestrator')));
    });

    it('should detect memory tool dependency', () => {
        const skill = makeSkill('Use search_memory to find previous context. Use save_memory to store.');
        const result = analyzeCompatibility(skill, [], {}, {});
        assert.strictEqual(result.compatible, false);
        assert.ok(result.mcpDependencies.length > 0);
    });

    it('should resolve memory dependency when plugin has MCP server', () => {
        const skill = makeSkill('Use search_memory to find context.');
        const pluginMcp = [makeMcpServer('memory-server')];
        const result = analyzeCompatibility(skill, pluginMcp, {}, {});
        assert.strictEqual(result.compatible, true);
        assert.strictEqual(result.issues.length, 0);
    });

    it('should resolve memory dependency when MCP server already imported', () => {
        const skill = makeSkill('Use save_memory to store context.');
        const imported: Record<string, McpServerRecord> = {
            'memory-server': { source: 'test@test', importedAt: '2026-01-01' },
        };
        const result = analyzeCompatibility(skill, [], imported, {});
        assert.strictEqual(result.compatible, true);
    });

    it('should resolve memory dependency when system MCP server exists', () => {
        const skill = makeSkill('Use search_memory to recall.');
        const systemServers = { 'my-memory': { command: 'npx', args: ['-y', 'memory-server'] } };
        const result = analyzeCompatibility(skill, [], {}, systemServers);
        assert.strictEqual(result.compatible, true);
    });

    it('should remain incompatible when sub-agent + unresolved MCP', () => {
        const skill = makeSkill('Dispatch subtask. Use search_memory.');
        const result = analyzeCompatibility(skill, [], {}, {});
        assert.strictEqual(result.compatible, false);
        assert.ok(result.issues.length >= 1);
    });

    it('should handle multiple blocking patterns', () => {
        const skill = makeSkill('Dispatch subtask. Use AskUserQuestion. Check skills before every response.');
        const result = analyzeCompatibility(skill, [], {}, {});
        assert.strictEqual(result.compatible, false);
        assert.ok(result.issues.length >= 2);
    });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run compile && npm run test:unit -- --grep "analyzeCompatibility"`
Expected: FAIL — module `../../compatAnalyzer` does not exist

**Step 3: Write the implementation**

Create `src/compatAnalyzer.ts`:

```typescript
import { SkillInfo, McpServerInfo, McpServerRecord } from './types';

export interface CompatResult {
    compatible: boolean;
    issues: string[];
    mcpDependencies: string[];
}

interface BlockingPattern {
    pattern: RegExp;
    reason: string;
    mcpResolvable: boolean;
}

const BLOCKING_PATTERNS: BlockingPattern[] = [
    // Sub-agent architecture
    { pattern: /dispatch\w*\s+\w*subtask/i, reason: 'Requires sub-agent dispatch', mcpResolvable: false },
    { pattern: /spawn\w*\s+\w*agent/i, reason: 'Requires sub-agent dispatch', mcpResolvable: false },
    { pattern: /parallel\s+agents?/i, reason: 'Requires parallel agent architecture', mcpResolvable: false },
    { pattern: /launch\s+.*agents?\s+.*(?:independent|parallel|concurrent)/i, reason: 'Requires parallel agent architecture', mcpResolvable: false },

    // Interactive tool
    { pattern: /\bAskUserQuestion\b/, reason: 'Requires AskUserQuestion tool (no Copilot equivalent)', mcpResolvable: false },

    // Meta-orchestrator
    { pattern: /check\s+skills?\s+before\s+every\s+response/i, reason: 'Meta-orchestrator pattern (no Copilot equivalent)', mcpResolvable: false },
    { pattern: /invoke.*skill.*before.*any.*response/i, reason: 'Meta-orchestrator pattern (no Copilot equivalent)', mcpResolvable: false },

    // MCP memory tools (resolvable if server available)
    { pattern: /\bsearch_memory\b/, reason: 'Requires MCP memory server', mcpResolvable: true },
    { pattern: /\bsave_memory\b/, reason: 'Requires MCP memory server', mcpResolvable: true },
];

function hasMcpServerAvailable(
    pluginMcpServers: McpServerInfo[],
    importedMcpServers: Record<string, McpServerRecord>,
    systemMcpServers: Record<string, any>,
): boolean {
    if (pluginMcpServers.length > 0) { return true; }
    if (Object.keys(importedMcpServers).length > 0) { return true; }
    if (Object.keys(systemMcpServers).length > 0) { return true; }
    return false;
}

export function analyzeCompatibility(
    skill: SkillInfo,
    pluginMcpServers: McpServerInfo[],
    importedMcpServers: Record<string, McpServerRecord>,
    systemMcpServers: Record<string, any>,
): CompatResult {
    const issues: string[] = [];
    const mcpDependencies: string[] = [];
    const content = skill.content;

    const mcpAvailable = hasMcpServerAvailable(pluginMcpServers, importedMcpServers, systemMcpServers);

    for (const bp of BLOCKING_PATTERNS) {
        if (!bp.pattern.test(content)) { continue; }

        if (bp.mcpResolvable) {
            mcpDependencies.push(bp.reason);
            if (!mcpAvailable) {
                issues.push(bp.reason);
            }
        } else {
            issues.push(bp.reason);
        }
    }

    return {
        compatible: issues.length === 0,
        issues,
        mcpDependencies,
    };
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run compile && npm run test:unit -- --grep "analyzeCompatibility"`
Expected: PASS — all 11 tests green

**Step 5: Commit**

```bash
git add src/compatAnalyzer.ts src/test/unit/compatAnalyzer.test.ts
git commit -m "feat: add compatibility analyzer with MCP awareness"
```

---

### Task 3: Add `generateFullPromptFile` to converter

**Files:**
- Modify: `src/converter.ts:60-69`
- Modify: `src/test/unit/converter.test.ts`

**Step 1: Write the failing test**

Add to `src/test/unit/converter.test.ts` after the `generatePromptFile` describe block (after line 91):

```typescript
describe('generateFullPromptFile', () => {
    it('should include full converted body in the prompt file', () => {
        const result = generateFullPromptFile('brainstorming', 'Creative work helper', 'Body content here');
        assert.ok(result.startsWith('---\n'));
        assert.ok(result.includes('name: brainstorming'));
        assert.ok(result.includes('agent: agent'));
        assert.ok(result.includes('Body content here'));
    });

    it('should not include applyTo in prompt frontmatter', () => {
        const result = generateFullPromptFile('test', 'desc', 'body');
        assert.ok(!result.includes('applyTo'));
    });

    it('should escape single quotes in description', () => {
        const result = generateFullPromptFile('test', "it's a test", 'body');
        assert.ok(result.includes("it''s a test"));
    });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run compile && npm run test:unit -- --grep "generateFullPromptFile"`
Expected: FAIL — `generateFullPromptFile` is not exported

**Step 3: Write the implementation**

Add to `src/converter.ts` after the existing `generatePromptFile` function (after line 69):

```typescript
export function generateFullPromptFile(name: string, description: string, convertedBody: string): string {
    return `---
name: ${name}
description: '${description.replace(/'/g, "''")}'
agent: agent
---

${convertedBody}
`;
}
```

**Step 4: Update the test import**

In `src/test/unit/converter.test.ts` line 2, add `generateFullPromptFile` to the import:

```typescript
import { convertSkillContent, generateInstructionsFile, generatePromptFile, generateRegistryEntry, generateFullPromptFile } from '../../converter';
```

**Step 5: Run tests to verify they pass**

Run: `npm run compile && npm run test:unit -- --grep "generateFullPromptFile"`
Expected: PASS — all 3 tests green

**Step 6: Commit**

```bash
git add src/converter.ts src/test/unit/converter.test.ts
git commit -m "feat: add generateFullPromptFile for full-content prompt files"
```

---

### Task 4: Update `writeSkillFiles` to use full-content prompts

**Files:**
- Modify: `src/importService.ts:1-3,88,188-193`

**Step 1: Write the failing test**

Add to `src/test/unit/importService.test.ts` after the existing `convertSkill` describe block (after line 76):

```typescript
describe('ImportService.writeSkillFiles prompt format', () => {
    const workspaceUri = { fsPath: '/tmp/test-workspace', path: '/tmp/test-workspace' } as any;
    let service: ImportService;
    const vscode = require('vscode');
    let writtenFiles: Array<{ path: string; content: string }>;
    let origWriteFile: any;

    before(() => {
        origWriteFile = vscode.workspace.fs.writeFile;
    });

    beforeEach(() => {
        service = new ImportService(workspaceUri);
        writtenFiles = [];
        vscode.workspace.fs.writeFile = async (uri: any, content: Buffer) => {
            writtenFiles.push({ path: uri.fsPath, content: content.toString('utf-8') });
        };
    });

    afterEach(() => {
        vscode.workspace.fs.writeFile = origWriteFile;
    });

    it('should write full-content prompt file when format is prompts', async () => {
        const skill = makeSkill();
        // Use importAllSkills with a single skill to trigger writeSkillFiles
        vscode.window.showInformationMessage = async () => 'Import All';
        await service.importAllSkills([skill], ['prompts'], false);

        const promptFile = writtenFiles.find(f => f.path.includes('.prompt.md'));
        assert.ok(promptFile, 'Should have written a prompt file');
        assert.ok(promptFile!.content.includes('agent: agent'), 'Prompt should have agent frontmatter');
        assert.ok(promptFile!.content.length > 100, 'Prompt should contain full body, not just a pointer');
    });

    it('should write pointer prompt when format includes instructions', async () => {
        const skill = makeSkill();
        vscode.window.showInformationMessage = async () => 'Import All';
        await service.importAllSkills([skill], ['instructions', 'prompts'], false);

        const promptFile = writtenFiles.find(f => f.path.includes('.prompt.md'));
        assert.ok(promptFile, 'Should have written a prompt file');
        assert.ok(promptFile!.content.includes('Follow the instructions in'), 'Should be a pointer when instructions also generated');
    });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run compile && npm run test:unit -- --grep "writeSkillFiles prompt format"`
Expected: FAIL — prompt file contains pointer, not full content

**Step 3: Update the import and writeSkillFiles**

In `src/importService.ts`:

1. Add `generateFullPromptFile` to the converter import (line 3):

```typescript
import { convertSkillContent, generateInstructionsFile, generatePromptFile, generateFullPromptFile, generateRegistryEntry } from './converter';
```

2. Update `writeSkillFiles` method (around line 191). Replace the prompts block:

```typescript
        if (outputFormats.includes('prompts')) {
            await writePromptFile(this.workspaceUri, skill.name, conversion.promptContent);
        }
```

with:

```typescript
        if (outputFormats.includes('prompts')) {
            const promptsOnly = !outputFormats.includes('instructions');
            const promptContent = promptsOnly
                ? generateFullPromptFile(skill.name, skill.description, conversion.instructionsContent)
                : conversion.promptContent;
            await writePromptFile(this.workspaceUri, skill.name, promptContent);
        }
```

**Step 4: Run tests to verify they pass**

Run: `npm run compile && npm run test:unit -- --grep "writeSkillFiles prompt format"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/importService.ts src/test/unit/importService.test.ts
git commit -m "feat: write full-content prompt files in prompts-only mode"
```

---

### Task 5: Change default output format to prompts-only

**Files:**
- Modify: `package.json:187-190`
- Modify: `src/extension.ts:144`

**Step 1: Update package.json default**

In `package.json`, change the `outputFormats` default (lines 187-190) from:

```json
          "default": [
            "instructions",
            "prompts"
          ],
```

to:

```json
          "default": [
            "prompts"
          ],
```

**Step 2: Update extension.ts fallback default**

In `src/extension.ts` line 144, change:

```typescript
            outputFormats: config.get<string[]>('outputFormats', ['instructions', 'prompts']),
```

to:

```typescript
            outputFormats: config.get<string[]>('outputFormats', ['prompts']),
```

**Step 3: Verify compilation**

Run: `npm run compile`
Expected: PASS

**Step 4: Commit**

```bash
git add package.json src/extension.ts
git commit -m "feat: change default output format to prompts-only"
```

---

### Task 6: Add incompatible badge to tree view

**Files:**
- Modify: `src/treeView.ts:31-50,89-115,140-165`
- Modify: `src/test/unit/treeView.test.ts`

**Step 1: Write the failing tests**

Add to `src/test/unit/treeView.test.ts` after the existing `TreeView MCP support` describe block:

```typescript
describe('TreeView incompatible skills', () => {
    let provider: SkillBridgeTreeProvider;

    beforeEach(() => {
        provider = new SkillBridgeTreeProvider();
    });

    it('should mark skill as incompatible when it has blocking patterns', () => {
        const plugin = makePlugin({
            name: 'test-plugin',
            marketplace: 'test',
            skills: [{
                name: 'parallel-agents',
                description: 'Dispatch parallel agents',
                content: 'Launch parallel agents to handle work independently.',
                pluginName: 'test-plugin',
                pluginVersion: '1.0.0',
                marketplace: 'test',
                source: 'local',
            }],
        });
        provider.setData([plugin], makeManifest());

        const pluginItem = provider.getChildren(undefined)[0];
        const children = provider.getChildren(pluginItem);
        const skill = children.find(c => c.itemType === 'skill');
        assert.ok(skill, 'Should have a skill child');
        assert.strictEqual(skill!.contextValue, 'skill-incompatible');
        assert.ok(skill!.description?.toString().length! > 0, 'Should have incompatible description');
    });

    it('should mark compatible skill normally', () => {
        const plugin = makePlugin({
            name: 'test-plugin',
            marketplace: 'test',
            skills: [{
                name: 'tdd',
                description: 'Test driven development',
                content: 'Write tests first, then implement.',
                pluginName: 'test-plugin',
                pluginVersion: '1.0.0',
                marketplace: 'test',
                source: 'local',
            }],
        });
        provider.setData([plugin], makeManifest());

        const pluginItem = provider.getChildren(undefined)[0];
        const children = provider.getChildren(pluginItem);
        const skill = children.find(c => c.itemType === 'skill');
        assert.ok(skill, 'Should have a skill child');
        assert.ok(skill!.contextValue !== 'skill-incompatible', 'Should not be incompatible');
    });

    it('should resolve MCP dependency when plugin has MCP servers', () => {
        const plugin = makePlugin({
            name: 'memory-plugin',
            marketplace: 'test',
            skills: [{
                name: 'long-term-memory',
                description: 'Memory skill',
                content: 'Use search_memory to find previous context.',
                pluginName: 'memory-plugin',
                pluginVersion: '1.0.0',
                marketplace: 'test',
                source: 'local',
            }],
            mcpServers: [{
                name: 'memory-server',
                config: { command: 'npx' },
                pluginName: 'memory-plugin',
                pluginVersion: '1.0.0',
                marketplace: 'test',
            }],
        });
        provider.setData([plugin], makeManifest());

        const pluginItem = provider.getChildren(undefined)[0];
        const children = provider.getChildren(pluginItem);
        const skill = children.find(c => c.itemType === 'skill');
        assert.ok(skill!.contextValue !== 'skill-incompatible', 'Should be compatible — MCP server available');
    });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run compile && npm run test:unit -- --grep "TreeView incompatible"`
Expected: FAIL — skill not marked as incompatible

**Step 3: Update treeView.ts**

3a. Add the import at the top of `src/treeView.ts` (after line 4):

```typescript
import { analyzeCompatibility } from './compatAnalyzer';
```

3b. Add the `incompatible` case in the `SkillTreeItem` constructor, after the `conflict` case (after line 49, inside the `skill` itemType block):

```typescript
                case 'incompatible':
                    this.iconPath = new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('disabledForeground'));
                    break;
```

3c. Update `getPluginChildren` method to run the analyzer. Replace the entire method body (lines 140-165) with:

```typescript
    private getPluginChildren(plugin: PluginInfo): SkillTreeItem[] {
        const children: SkillTreeItem[] = [];
        const pluginMcpServers = plugin.mcpServers ?? [];

        for (const skill of plugin.skills) {
            const compat = analyzeCompatibility(skill, pluginMcpServers, this.manifest.mcpServers ?? {}, {});

            if (!compat.compatible) {
                const item = new SkillTreeItem(skill.name, 'skill', plugin, skill, 'incompatible');
                item.description = compat.issues[0] ?? 'incompatible';
                children.push(item);
                continue;
            }

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

            children.push(new SkillTreeItem(skill.name, 'skill', plugin, skill, status));
        }

        const mcpServers = plugin.mcpServers ?? [];
        if (mcpServers.length > 0) {
            children.push(new SkillTreeItem('MCP Servers', 'mcpGroup', plugin));
        }

        return children;
    }
```

Note: The system MCP servers parameter is passed as `{}` for now. Reading `.vscode/mcp.json` requires async I/O which would change `getChildren` to async. This can be enhanced later. Plugin-level and manifest-level MCP resolution covers the primary use cases.

**Step 4: Run tests to verify they pass**

Run: `npm run compile && npm run test:unit -- --grep "TreeView incompatible"`
Expected: PASS — all 3 tests green

**Step 5: Run full test suite**

Run: `npm run compile && npm run test:unit`
Expected: PASS — all existing tests still pass

**Step 6: Commit**

```bash
git add src/treeView.ts src/test/unit/treeView.test.ts
git commit -m "feat: show incompatible badge on skills in tree view"
```

---

### Task 7: Add compatibility gate to import flow

**Files:**
- Modify: `src/importService.ts:2,82-90,92-177`
- Modify: `src/test/unit/importService.test.ts`

**Step 1: Write the failing tests**

Add to `src/test/unit/importService.test.ts`:

```typescript
describe('ImportService compatibility gate', () => {
    const workspaceUri = { fsPath: '/tmp/test-workspace', path: '/tmp/test-workspace' } as any;
    let service: ImportService;
    const vscode = require('vscode');
    let warningMessages: string[];
    let origShowWarning: any;
    let origShowInfo: any;

    before(() => {
        origShowWarning = vscode.window.showWarningMessage;
        origShowInfo = vscode.window.showInformationMessage;
    });

    beforeEach(() => {
        service = new ImportService(workspaceUri);
        warningMessages = [];
        vscode.window.showWarningMessage = async (msg: string) => {
            warningMessages.push(msg);
            return undefined;
        };
    });

    afterEach(() => {
        vscode.window.showWarningMessage = origShowWarning;
        vscode.window.showInformationMessage = origShowInfo;
    });

    it('should block import of incompatible skill with warning', async () => {
        const skill = makeSkill({
            content: 'Dispatch a subtask for each file. Launch parallel agents.',
        });
        vscode.window.showInformationMessage = async () => 'Accept';
        await service.importSkill(skill, ['prompts'], false);
        assert.ok(warningMessages.length > 0, 'Should show warning');
        assert.ok(warningMessages[0].includes('incompatible'), 'Warning should mention incompatible');
    });

    it('should allow import of compatible skill', async () => {
        const skill = makeSkill({
            content: '---\nname: tdd\ndescription: TDD\n---\nWrite tests first.',
        });
        vscode.window.showInformationMessage = async () => 'Accept';
        await service.importSkill(skill, ['prompts'], false);
        assert.strictEqual(warningMessages.length, 0, 'Should not show warning');
    });

    it('should skip incompatible skills in bulk import', async () => {
        const compatible = makeSkill({ name: 'tdd', content: '---\nname: tdd\ndescription: TDD\n---\nWrite tests.' });
        const incompatible = makeSkill({ name: 'parallel', content: 'Launch parallel agents to work.' });

        let confirmMsg = '';
        vscode.window.showInformationMessage = async (msg: string) => {
            confirmMsg = msg;
            return 'Import All';
        };

        const result = await service.importAllSkills([compatible, incompatible], ['prompts'], false);
        assert.strictEqual(result.imported.length, 1);
        assert.ok(result.imported.includes('tdd'));
        assert.ok(confirmMsg.includes('1 incompatible'));
    });

    it('should return empty when all skills incompatible in bulk', async () => {
        const skill = makeSkill({ content: 'Dispatch subtask. Launch parallel agents.' });
        const result = await service.importAllSkills([skill], ['prompts'], false);
        assert.strictEqual(result.imported.length, 0);
    });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run compile && npm run test:unit -- --grep "compatibility gate"`
Expected: FAIL — import proceeds without checking compatibility

**Step 3: Update importService.ts**

3a. Add import at the top of `src/importService.ts` (after line 9):

```typescript
import { analyzeCompatibility } from './compatAnalyzer';
```

3b. Update `importSkill` method (lines 82-90). Replace with:

```typescript
    async importSkill(skill: SkillInfo, outputFormats: string[], generateRegistry: boolean): Promise<void> {
        const compat = analyzeCompatibility(skill, [], {}, {});
        if (!compat.compatible) {
            vscode.window.showWarningMessage(
                `Skill "${skill.name}" is incompatible with VS Code Copilot: ${compat.issues.join('; ')}`
            );
            return;
        }

        const conversion = this.convertSkill(skill);

        const accepted = await this.showPreview(skill, conversion);
        if (!accepted) { return; }

        await this.writeSkillFiles(skill, conversion, outputFormats, generateRegistry);
        vscode.window.showInformationMessage(`Imported skill: ${skill.name}`);
    }
```

3c. Update `importAllSkills` method. After the early return for empty arrays (line 101), add compatibility filtering before the conversions block. Replace lines 103-111 with:

```typescript
        const compatResults = skills.map(skill => ({
            skill,
            compat: analyzeCompatibility(skill, [], {}, {}),
        }));

        const compatibleSkills = compatResults.filter(r => r.compat.compatible).map(r => r.skill);
        const incompatibleCount = skills.length - compatibleSkills.length;

        if (compatibleSkills.length === 0 && (!mcpServers || mcpServers.length === 0)) {
            vscode.window.showWarningMessage(
                `All ${skills.length} skill(s) are incompatible with VS Code Copilot.`
            );
            return result;
        }

        const conversions = compatibleSkills.map(skill => ({
            skill,
            conversion: this.convertSkill(skill),
        }));

        const skillNames = compatibleSkills.map(s => s.name);
        const summary = compatibleSkills.length <= 5
            ? skillNames.join(', ')
            : `${skillNames.slice(0, 3).join(', ')} and ${compatibleSkills.length - 3} more`;

        const incompatibleNote = incompatibleCount > 0 ? ` (${incompatibleCount} incompatible, skipped)` : '';
```

Then update the confirmation message (the `showInformationMessage` call) to:

```typescript
        const choice = await vscode.window.showInformationMessage(
            `Import ${compatibleSkills.length} skill(s)${incompatibleNote}: ${summary}?`,
            { modal: true },
            'Import All',
            'Cancel'
        );
```

And update the total count for progress to use `compatibleSkills.length`:

```typescript
                const total = compatibleSkills.length + (mcpServers?.length ?? 0);
```

**Step 4: Run tests to verify they pass**

Run: `npm run compile && npm run test:unit -- --grep "compatibility gate"`
Expected: PASS — all 4 tests green

**Step 5: Run full test suite**

Run: `npm run compile && npm run test:unit`
Expected: PASS — all tests pass

**Step 6: Commit**

```bash
git add src/importService.ts src/test/unit/importService.test.ts
git commit -m "feat: add compatibility gate to skill import flow"
```

---

### Task 8: Run full verification

**Files:** None — verification only.

**Step 1: Full compile**

Run: `npm run compile`
Expected: PASS

**Step 2: Full test suite**

Run: `npm run test:unit`
Expected: PASS — ~175+ tests

**Step 3: Lint check**

Run: `npm run lint`
Expected: PASS

**Step 4: Commit any remaining fixes**

If any issues found, fix and commit.

---

### Task 9: Create PR

**Step 1: Create feature branch and push**

```bash
git checkout -b feat/smart-conversion
git push -u origin feat/smart-conversion
```

**Step 2: Create PR**

```bash
gh pr create --title "feat: smart skill conversion with compatibility analysis" --body "$(cat <<'EOF'
## Summary
- Add compatibility analyzer that detects Claude Code-specific constructs (sub-agent dispatch, parallel agents, AskUserQuestion, meta-orchestration)
- MCP-aware: skills requiring MCP servers are compatible when the server is available (plugin, imported, or system)
- Generate full-content prompt files (.prompt.md) instead of pointer files
- Change default output format from [instructions, prompts] to [prompts] — mirrors Claude's on-demand skill loading
- Show incompatible badge in tree view with reason
- Gate import flow: single import warns, bulk import skips with summary

## Test plan
- [ ] `npm run compile` passes
- [ ] `npm run test:unit` passes (all new + existing tests)
- [ ] `npm run lint` passes
- [ ] Manual: compatible skill imports via /slash-command
- [ ] Manual: incompatible skill shows warning, import blocked
- [ ] Manual: tree view shows incompatible badge
- [ ] Manual: bulk import skips incompatible with count in summary

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
