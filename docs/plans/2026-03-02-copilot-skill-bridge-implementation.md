# Copilot Skill Bridge — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a VS Code extension that discovers Claude Code marketplace skills (local + remote), auto-converts them to Copilot instruction/prompt files, and watches for updates.

**Architecture:** TreeView sidebar for discovery, a conversion engine that strips Claude-specific references, file writers for Copilot formats, and a watcher system for update detection. All state tracked in a JSON manifest per workspace.

**Tech Stack:** TypeScript, VS Code Extension API, `vscode.workspace.fs`, GitHub REST API via `fetch`, `vscode.FileSystemWatcher`

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.vscodeignore`
- Create: `src/extension.ts`
- Create: `.gitignore`

**Step 1: Initialize the project**

```bash
cd /c/Projects/Prive/CopilotBridge
npm init -y
```

**Step 2: Install dependencies**

```bash
npm install -D typescript @types/vscode @types/node @vscode/test-electron esbuild @types/mocha mocha
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "lib": ["ES2022"],
    "outDir": "out",
    "rootDir": "src",
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "out", ".vscode-test"]
}
```

**Step 4: Update package.json with extension manifest**

```json
{
  "name": "copilot-skill-bridge",
  "displayName": "Copilot Skill Bridge",
  "description": "Bridge Claude Code marketplace skills into GitHub Copilot",
  "version": "0.1.0",
  "publisher": "copilot-skill-bridge",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other"],
  "activationEvents": ["onStartupFinished"],
  "main": "./out/extension.js",
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "copilot-skill-bridge",
          "title": "Copilot Skill Bridge",
          "icon": "$(extensions)"
        }
      ]
    },
    "views": {
      "copilot-skill-bridge": [
        {
          "id": "skillBridgeExplorer",
          "name": "Skills"
        }
      ]
    },
    "commands": [
      { "command": "copilotSkillBridge.importSkill", "title": "Copilot Skill Bridge: Import Skill" },
      { "command": "copilotSkillBridge.importAllSkills", "title": "Copilot Skill Bridge: Import All Skills" },
      { "command": "copilotSkillBridge.checkForUpdates", "title": "Copilot Skill Bridge: Check for Updates" },
      { "command": "copilotSkillBridge.addMarketplace", "title": "Copilot Skill Bridge: Add Marketplace" },
      { "command": "copilotSkillBridge.removeSkill", "title": "Copilot Skill Bridge: Remove Skill" },
      { "command": "copilotSkillBridge.rebuildRegistry", "title": "Copilot Skill Bridge: Rebuild Registry" }
    ],
    "configuration": {
      "title": "Copilot Skill Bridge",
      "properties": {
        "copilotSkillBridge.claudeCachePath": {
          "type": "string",
          "default": "~/.claude/plugins/cache",
          "description": "Path to Claude Code plugin cache directory"
        },
        "copilotSkillBridge.marketplaces": {
          "type": "array",
          "items": { "type": "string" },
          "default": ["obra/superpowers"],
          "description": "GitHub repos to fetch marketplace skills from"
        },
        "copilotSkillBridge.checkInterval": {
          "type": "number",
          "default": 86400,
          "description": "Remote update check interval in seconds"
        },
        "copilotSkillBridge.autoAcceptUpdates": {
          "type": "boolean",
          "default": false,
          "description": "Automatically accept skill updates without prompting"
        },
        "copilotSkillBridge.outputFormats": {
          "type": "array",
          "items": { "type": "string", "enum": ["instructions", "prompts"] },
          "default": ["instructions", "prompts"],
          "description": "Which Copilot file formats to generate"
        },
        "copilotSkillBridge.generateRegistry": {
          "type": "boolean",
          "default": true,
          "description": "Add skill registry to copilot-instructions.md"
        }
      }
    }
  },
  "scripts": {
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "build": "esbuild src/extension.ts --bundle --outfile=out/extension.js --external:vscode --format=cjs --platform=node --sourcemap",
    "test": "mocha out/test/**/*.test.js",
    "lint": "tsc --noEmit"
  }
}
```

**Step 5: Create minimal extension entry point**

Create `src/extension.ts`:

```typescript
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('Copilot Skill Bridge activated');
}

export function deactivate() {}
```

**Step 6: Create .vscodeignore**

```
.vscode/**
.vscode-test/**
src/**
node_modules/**
.gitignore
tsconfig.json
**/*.map
```

**Step 7: Create .gitignore**

```
node_modules/
out/
.vscode-test/
*.vsix
```

**Step 8: Verify it compiles**

Run: `npm run compile`
Expected: No errors, `out/extension.js` created

**Step 9: Initialize git and commit**

```bash
git init
git add package.json tsconfig.json .vscodeignore .gitignore src/extension.ts
git commit -m "chore: scaffold VS Code extension project"
```

---

### Task 2: Types & Interfaces

**Files:**
- Create: `src/types.ts`
- Create: `src/test/types.test.ts`

**Step 1: Write the test**

Create `src/test/types.test.ts`:

```typescript
import * as assert from 'assert';
import { SkillStatus, SkillInfo, PluginInfo, MarketplaceInfo, SkillImportState, BridgeManifest } from '../types';

describe('Types', () => {
    it('should create a valid SkillInfo', () => {
        const skill: SkillInfo = {
            name: 'brainstorming',
            description: 'Use when starting creative work',
            content: '# Brainstorming\n\nContent here',
            pluginName: 'superpowers',
            pluginVersion: '4.3.1',
            marketplace: 'superpowers-marketplace',
            source: 'local',
            filePath: '/home/user/.claude/plugins/cache/superpowers-marketplace/superpowers/4.3.1/skills/brainstorming/SKILL.md',
        };
        assert.strictEqual(skill.name, 'brainstorming');
        assert.strictEqual(skill.source, 'local');
    });

    it('should create a valid BridgeManifest', () => {
        const manifest: BridgeManifest = {
            skills: {},
            marketplaces: [],
            settings: {
                checkInterval: 86400,
                autoAcceptUpdates: false,
            },
        };
        assert.deepStrictEqual(manifest.skills, {});
        assert.strictEqual(manifest.settings.checkInterval, 86400);
    });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run compile && npm test`
Expected: FAIL — module '../types' not found

**Step 3: Write the types**

Create `src/types.ts`:

```typescript
export type SkillStatus = 'synced' | 'available' | 'update-available' | 'conflict';

export type SkillSource = 'local' | 'remote' | 'both';

export type OutputFormat = 'instructions' | 'prompts';

export interface SkillInfo {
    name: string;
    description: string;
    content: string;
    pluginName: string;
    pluginVersion: string;
    marketplace: string;
    source: SkillSource;
    filePath?: string;
}

export interface PluginInfo {
    name: string;
    description: string;
    version: string;
    author?: { name: string; email?: string };
    skills: SkillInfo[];
    marketplace: string;
    source: SkillSource;
}

export interface MarketplaceInfo {
    name: string;
    repo: string;
    plugins: PluginInfo[];
    lastChecked?: string;
}

export interface SkillImportState {
    source: string;
    sourceHash: string;
    importedHash: string;
    importedAt: string;
    locallyModified: boolean;
}

export interface BridgeManifest {
    skills: Record<string, SkillImportState>;
    marketplaces: Array<{ repo: string; lastChecked: string }>;
    settings: {
        checkInterval: number;
        autoAcceptUpdates: boolean;
    };
}

export interface ConversionResult {
    instructionsContent: string;
    promptContent: string;
    registryEntry: { name: string; trigger: string; file: string };
    originalContent: string;
}

export interface PluginJson {
    name: string;
    description: string;
    version: string;
    author?: { name: string; email?: string };
    skills?: string;
    agents?: string;
    commands?: string;
    hooks?: string;
}

export interface MarketplaceJson {
    name: string;
    description: string;
    owner?: { name: string; email?: string };
    plugins: Array<{
        name: string;
        description: string;
        version: string;
        source: string;
        author?: { name: string; email?: string };
    }>;
}
```

**Step 4: Run test to verify it passes**

Run: `npm run compile && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/types.ts src/test/types.test.ts
git commit -m "feat: add core type definitions"
```

---

### Task 3: Skill Frontmatter Parser

**Files:**
- Create: `src/parser.ts`
- Create: `src/test/parser.test.ts`

**Step 1: Write the failing test**

Create `src/test/parser.test.ts`:

```typescript
import * as assert from 'assert';
import { parseSkillFrontmatter } from '../parser';

describe('parseSkillFrontmatter', () => {
    it('should parse YAML frontmatter from SKILL.md content', () => {
        const content = `---
name: brainstorming
description: Use when starting creative work
---

# Brainstorming

Content here.`;

        const result = parseSkillFrontmatter(content);
        assert.strictEqual(result.name, 'brainstorming');
        assert.strictEqual(result.description, 'Use when starting creative work');
        assert.strictEqual(result.body.trim(), '# Brainstorming\n\nContent here.');
    });

    it('should handle content without frontmatter', () => {
        const content = '# Just Content\n\nNo frontmatter here.';
        const result = parseSkillFrontmatter(content);
        assert.strictEqual(result.name, '');
        assert.strictEqual(result.description, '');
        assert.strictEqual(result.body, content);
    });

    it('should handle empty description', () => {
        const content = `---
name: my-skill
description:
---

Body text.`;
        const result = parseSkillFrontmatter(content);
        assert.strictEqual(result.name, 'my-skill');
        assert.strictEqual(result.description, '');
    });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run compile && npm test`
Expected: FAIL — module '../parser' not found

**Step 3: Write the parser**

Create `src/parser.ts`:

```typescript
export interface ParsedSkill {
    name: string;
    description: string;
    body: string;
}

export function parseSkillFrontmatter(content: string): ParsedSkill {
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
        return { name: '', description: '', body: content };
    }

    const frontmatter = match[1];
    const body = match[2];

    const nameMatch = frontmatter.match(/^name:\s*['"]?(.+?)['"]?\s*$/m);
    const descMatch = frontmatter.match(/^description:\s*['"]?(.+?)['"]?\s*$/m);

    return {
        name: nameMatch?.[1]?.trim() ?? '',
        description: descMatch?.[1]?.trim() ?? '',
        body: body.trimStart(),
    };
}
```

**Step 4: Run test to verify it passes**

Run: `npm run compile && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/parser.ts src/test/parser.test.ts
git commit -m "feat: add skill frontmatter parser"
```

---

### Task 4: Conversion Engine

**Files:**
- Create: `src/converter.ts`
- Create: `src/test/converter.test.ts`

**Step 1: Write the failing test**

Create `src/test/converter.test.ts`:

```typescript
import * as assert from 'assert';
import { convertSkillContent, generateInstructionsFile, generatePromptFile, generateRegistryEntry } from '../converter';

describe('convertSkillContent', () => {
    it('should replace TodoWrite references', () => {
        const input = 'Use the TodoWrite tool to track tasks.';
        const result = convertSkillContent(input);
        assert.ok(!result.includes('TodoWrite'));
        assert.ok(result.includes('checklist'));
    });

    it('should replace Agent/subagent references', () => {
        const input = 'Use the Agent tool to dispatch subagents for parallel work.';
        const result = convertSkillContent(input);
        assert.ok(!result.includes('Agent tool'));
        assert.ok(!result.includes('subagents'));
    });

    it('should replace Skill tool invocations', () => {
        const input = 'Invoke the Skill tool with superpowers:brainstorming.';
        const result = convertSkillContent(input);
        assert.ok(!result.includes('Skill tool'));
        assert.ok(result.includes('.github/instructions/'));
    });

    it('should replace file operation tool refs', () => {
        const input = 'Use the Read tool to read the file. Then use Grep to search.';
        const result = convertSkillContent(input);
        assert.ok(!result.includes('Read tool'));
        assert.ok(!result.includes('Grep'));
    });

    it('should replace EnterPlanMode/ExitPlanMode', () => {
        const input = 'Call EnterPlanMode to start planning. Then ExitPlanMode when done.';
        const result = convertSkillContent(input);
        assert.ok(!result.includes('EnterPlanMode'));
        assert.ok(!result.includes('ExitPlanMode'));
    });

    it('should replace CLAUDE.md references', () => {
        const input = 'Check the CLAUDE.md for project instructions.';
        const result = convertSkillContent(input);
        assert.ok(!result.includes('CLAUDE.md'));
        assert.ok(result.includes('copilot-instructions.md'));
    });

    it('should remove ~/.claude/ paths', () => {
        const input = 'Found at ~/.claude/plugins/cache/foo.';
        const result = convertSkillContent(input);
        assert.ok(!result.includes('~/.claude/'));
    });

    it('should rewrite superpowers: skill cross-references', () => {
        const input = 'Use superpowers:test-driven-development for TDD.';
        const result = convertSkillContent(input);
        assert.ok(result.includes('.github/instructions/test-driven-development.instructions.md'));
    });

    it('should preserve graphviz diagrams', () => {
        const input = '```dot\ndigraph { A -> B; }\n```';
        const result = convertSkillContent(input);
        assert.ok(result.includes('digraph'));
    });

    it('should preserve checklists', () => {
        const input = '- [ ] Do this\n- [x] Done that';
        const result = convertSkillContent(input);
        assert.strictEqual(result, input);
    });
});

describe('generateInstructionsFile', () => {
    it('should produce valid instructions markdown with frontmatter', () => {
        const result = generateInstructionsFile('brainstorming', 'Creative work helper', 'Body content');
        assert.ok(result.startsWith('---\n'));
        assert.ok(result.includes("name: 'Brainstorming'"));
        assert.ok(result.includes('applyTo:'));
        assert.ok(result.includes('Body content'));
    });
});

describe('generatePromptFile', () => {
    it('should produce valid prompt markdown with frontmatter', () => {
        const result = generatePromptFile('brainstorming', 'Creative work helper', 'Body content');
        assert.ok(result.startsWith('---\n'));
        assert.ok(result.includes('name: brainstorming'));
        assert.ok(result.includes('agent: agent'));
        assert.ok(result.includes('Body content'));
    });
});

describe('generateRegistryEntry', () => {
    it('should return registry table row data', () => {
        const result = generateRegistryEntry('brainstorming', 'Use before creative work');
        assert.strictEqual(result.name, 'brainstorming');
        assert.strictEqual(result.trigger, 'Use before creative work');
        assert.ok(result.file.includes('brainstorming.instructions.md'));
    });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run compile && npm test`
Expected: FAIL — module '../converter' not found

**Step 3: Write the converter**

Create `src/converter.ts`:

```typescript
interface RegistryEntry {
    name: string;
    trigger: string;
    file: string;
}

const CONVERSION_RULES: Array<{ pattern: RegExp; replacement: string }> = [
    // Tool references
    { pattern: /\bTodoWrite\b\s*tool/gi, replacement: 'task checklist' },
    { pattern: /\bTodoWrite\b/g, replacement: 'task checklist' },
    { pattern: /\buse the Agent tool\b/gi, replacement: 'break into subtasks and handle sequentially' },
    { pattern: /\bAgent tool\b/gi, replacement: 'subtask delegation' },
    { pattern: /\bsubagents?\b/gi, replacement: 'subtasks' },
    { pattern: /\bSkill tool\b/gi, replacement: 'instructions file' },
    { pattern: /\bRead tool\b/gi, replacement: 'file reading' },
    { pattern: /\bEdit tool\b/gi, replacement: 'file editing' },
    { pattern: /\bWrite tool\b/gi, replacement: 'file writing' },
    { pattern: /\bGrep\b(?!\s*\()/g, replacement: 'code search' },
    { pattern: /\bGlob\b(?!\s*\()/g, replacement: 'file search' },

    // Plan mode
    { pattern: /\bEnterPlanMode\b/g, replacement: 'present your plan to the user for approval' },
    { pattern: /\bExitPlanMode\b/g, replacement: 'finalize the plan and proceed' },

    // Claude-specific paths and files
    { pattern: /\bCLAUDE\.md\b/g, replacement: '.github/copilot-instructions.md' },
    { pattern: /~\/\.claude\/[\w/.-]*/g, replacement: '[local config]' },

    // Skill cross-references: superpowers:skill-name → file link
    { pattern: /superpowers:([\w-]+)/g, replacement: '.github/instructions/$1.instructions.md' },
];

export function convertSkillContent(content: string): string {
    let result = content;
    for (const rule of CONVERSION_RULES) {
        result = result.replace(rule.pattern, rule.replacement);
    }
    return result;
}

function toTitleCase(name: string): string {
    return name
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

export function generateInstructionsFile(name: string, description: string, convertedBody: string): string {
    const titleName = toTitleCase(name);
    return `---
name: '${titleName}'
description: '${description.replace(/'/g, "''")}'
applyTo: '**/*'
---

${convertedBody}
`;
}

export function generatePromptFile(name: string, description: string, convertedBody: string): string {
    return `---
name: ${name}
description: ${description}
agent: agent
---

${convertedBody}
`;
}

export function generateRegistryEntry(name: string, description: string): RegistryEntry {
    return {
        name,
        trigger: description,
        file: `.github/instructions/${name}.instructions.md`,
    };
}
```

**Step 4: Run test to verify it passes**

Run: `npm run compile && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/converter.ts src/test/converter.test.ts
git commit -m "feat: add conversion engine for Claude-to-Copilot transformation"
```

---

### Task 5: Local Skill Reader

**Files:**
- Create: `src/localReader.ts`
- Create: `src/test/localReader.test.ts`

**Step 1: Write the failing test**

Create `src/test/localReader.test.ts`:

```typescript
import * as assert from 'assert';
import { resolveClaudeCachePath, parsePluginJson, buildSkillInfo } from '../localReader';
import * as os from 'os';
import * as path from 'path';

describe('resolveClaudeCachePath', () => {
    it('should expand ~ to home directory', () => {
        const result = resolveClaudeCachePath('~/.claude/plugins/cache');
        assert.ok(result.startsWith(os.homedir()));
        assert.ok(result.endsWith(path.join('.claude', 'plugins', 'cache')));
    });

    it('should return absolute paths unchanged', () => {
        const abs = '/some/absolute/path';
        assert.strictEqual(resolveClaudeCachePath(abs), abs);
    });
});

describe('parsePluginJson', () => {
    it('should parse valid plugin.json content', () => {
        const json = JSON.stringify({
            name: 'superpowers',
            description: 'Core skills',
            version: '4.3.1',
            skills: './skills/',
        });
        const result = parsePluginJson(json);
        assert.strictEqual(result.name, 'superpowers');
        assert.strictEqual(result.version, '4.3.1');
    });

    it('should throw on invalid JSON', () => {
        assert.throws(() => parsePluginJson('not json'));
    });
});

describe('buildSkillInfo', () => {
    it('should build SkillInfo from parsed data', () => {
        const result = buildSkillInfo(
            'brainstorming',
            'Use before creative work',
            '# Content',
            'superpowers',
            '4.3.1',
            'superpowers-marketplace',
            '/path/to/SKILL.md'
        );
        assert.strictEqual(result.name, 'brainstorming');
        assert.strictEqual(result.source, 'local');
        assert.strictEqual(result.pluginVersion, '4.3.1');
    });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run compile && npm test`
Expected: FAIL — module '../localReader' not found

**Step 3: Write the local reader**

Create `src/localReader.ts`:

```typescript
import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { SkillInfo, PluginInfo, PluginJson } from './types';
import { parseSkillFrontmatter } from './parser';

export function resolveClaudeCachePath(configPath: string): string {
    if (configPath.startsWith('~')) {
        return path.join(os.homedir(), configPath.slice(1));
    }
    return configPath;
}

export function parsePluginJson(content: string): PluginJson {
    return JSON.parse(content) as PluginJson;
}

export function buildSkillInfo(
    name: string,
    description: string,
    content: string,
    pluginName: string,
    pluginVersion: string,
    marketplace: string,
    filePath: string
): SkillInfo {
    return {
        name,
        description,
        content,
        pluginName,
        pluginVersion,
        marketplace,
        source: 'local',
        filePath,
    };
}

export async function discoverLocalPlugins(cachePath: string): Promise<PluginInfo[]> {
    const resolvedPath = resolveClaudeCachePath(cachePath);
    const cacheUri = vscode.Uri.file(resolvedPath);
    const plugins: PluginInfo[] = [];

    let marketplaceDirs: [string, vscode.FileType][];
    try {
        marketplaceDirs = await vscode.workspace.fs.readDirectory(cacheUri);
    } catch {
        return plugins;
    }

    for (const [marketplaceName, marketplaceType] of marketplaceDirs) {
        if (marketplaceType !== vscode.FileType.Directory) { continue; }

        const marketplaceUri = vscode.Uri.joinPath(cacheUri, marketplaceName);
        let pluginDirs: [string, vscode.FileType][];
        try {
            pluginDirs = await vscode.workspace.fs.readDirectory(marketplaceUri);
        } catch { continue; }

        for (const [pluginDirName, pluginDirType] of pluginDirs) {
            if (pluginDirType !== vscode.FileType.Directory) { continue; }

            const pluginDirUri = vscode.Uri.joinPath(marketplaceUri, pluginDirName);
            let versionDirs: [string, vscode.FileType][];
            try {
                versionDirs = await vscode.workspace.fs.readDirectory(pluginDirUri);
            } catch { continue; }

            // Use the latest version directory
            const versions = versionDirs
                .filter(([, t]) => t === vscode.FileType.Directory)
                .map(([name]) => name)
                .sort()
                .reverse();

            if (versions.length === 0) { continue; }
            const latestVersion = versions[0];
            const versionUri = vscode.Uri.joinPath(pluginDirUri, latestVersion);

            // Read plugin.json
            const pluginJsonUri = vscode.Uri.joinPath(versionUri, '.claude-plugin', 'plugin.json');
            let pluginMeta: PluginJson;
            try {
                const raw = await vscode.workspace.fs.readFile(pluginJsonUri);
                pluginMeta = parsePluginJson(Buffer.from(raw).toString('utf-8'));
            } catch { continue; }

            // Discover skills
            const skillsDir = vscode.Uri.joinPath(versionUri, pluginMeta.skills ?? 'skills');
            const skills = await discoverSkillsInDir(skillsDir, pluginMeta.name, latestVersion, marketplaceName);

            plugins.push({
                name: pluginMeta.name,
                description: pluginMeta.description,
                version: latestVersion,
                author: pluginMeta.author,
                skills,
                marketplace: marketplaceName,
                source: 'local',
            });
        }
    }

    return plugins;
}

async function discoverSkillsInDir(
    skillsUri: vscode.Uri,
    pluginName: string,
    pluginVersion: string,
    marketplace: string
): Promise<SkillInfo[]> {
    const skills: SkillInfo[] = [];

    let entries: [string, vscode.FileType][];
    try {
        entries = await vscode.workspace.fs.readDirectory(skillsUri);
    } catch {
        return skills;
    }

    for (const [skillDirName, skillDirType] of entries) {
        if (skillDirType !== vscode.FileType.Directory) { continue; }

        const skillMdUri = vscode.Uri.joinPath(skillsUri, skillDirName, 'SKILL.md');
        try {
            const raw = await vscode.workspace.fs.readFile(skillMdUri);
            const content = Buffer.from(raw).toString('utf-8');
            const parsed = parseSkillFrontmatter(content);

            skills.push(buildSkillInfo(
                parsed.name || skillDirName,
                parsed.description,
                content,
                pluginName,
                pluginVersion,
                marketplace,
                skillMdUri.fsPath,
            ));
        } catch {
            // SKILL.md doesn't exist in this dir, skip
        }
    }

    return skills;
}
```

**Step 4: Run test to verify it passes**

Run: `npm run compile && npm test`
Expected: PASS (unit tests for pure functions pass; the async `discoverLocalPlugins` is integration-tested later)

**Step 5: Commit**

```bash
git add src/localReader.ts src/test/localReader.test.ts
git commit -m "feat: add local Claude plugin cache reader"
```

---

### Task 6: State Manager

**Files:**
- Create: `src/stateManager.ts`
- Create: `src/test/stateManager.test.ts`

**Step 1: Write the failing test**

Create `src/test/stateManager.test.ts`:

```typescript
import * as assert from 'assert';
import { createEmptyManifest, computeHash, isSkillImported, isSkillOutdated } from '../stateManager';
import { BridgeManifest } from '../types';

describe('createEmptyManifest', () => {
    it('should return a valid empty manifest', () => {
        const m = createEmptyManifest();
        assert.deepStrictEqual(m.skills, {});
        assert.deepStrictEqual(m.marketplaces, []);
        assert.strictEqual(m.settings.checkInterval, 86400);
    });
});

describe('computeHash', () => {
    it('should return consistent hash for same content', () => {
        const h1 = computeHash('hello world');
        const h2 = computeHash('hello world');
        assert.strictEqual(h1, h2);
    });

    it('should return different hash for different content', () => {
        const h1 = computeHash('hello');
        const h2 = computeHash('world');
        assert.notStrictEqual(h1, h2);
    });
});

describe('isSkillImported', () => {
    it('should return true if skill exists in manifest', () => {
        const m = createEmptyManifest();
        m.skills['brainstorming'] = {
            source: 'superpowers@superpowers-marketplace',
            sourceHash: 'abc',
            importedHash: 'abc',
            importedAt: '2026-01-01',
            locallyModified: false,
        };
        assert.strictEqual(isSkillImported(m, 'brainstorming'), true);
    });

    it('should return false for unknown skills', () => {
        const m = createEmptyManifest();
        assert.strictEqual(isSkillImported(m, 'unknown'), false);
    });
});

describe('isSkillOutdated', () => {
    it('should return true if source hash differs from imported hash', () => {
        const m = createEmptyManifest();
        m.skills['brainstorming'] = {
            source: 'test',
            sourceHash: 'new-hash',
            importedHash: 'old-hash',
            importedAt: '2026-01-01',
            locallyModified: false,
        };
        assert.strictEqual(isSkillOutdated(m, 'brainstorming', 'new-hash'), true);
    });

    it('should return false if hashes match', () => {
        const m = createEmptyManifest();
        m.skills['brainstorming'] = {
            source: 'test',
            sourceHash: 'same',
            importedHash: 'same',
            importedAt: '2026-01-01',
            locallyModified: false,
        };
        assert.strictEqual(isSkillOutdated(m, 'brainstorming', 'same'), false);
    });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run compile && npm test`
Expected: FAIL — module '../stateManager' not found

**Step 3: Write the state manager**

Create `src/stateManager.ts`:

```typescript
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { BridgeManifest, SkillImportState } from './types';

const MANIFEST_FILENAME = '.copilot-skill-bridge.json';

export function createEmptyManifest(): BridgeManifest {
    return {
        skills: {},
        marketplaces: [],
        settings: {
            checkInterval: 86400,
            autoAcceptUpdates: false,
        },
    };
}

export function computeHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
}

export function isSkillImported(manifest: BridgeManifest, skillName: string): boolean {
    return skillName in manifest.skills;
}

export function isSkillOutdated(manifest: BridgeManifest, skillName: string, currentSourceHash: string): boolean {
    const state = manifest.skills[skillName];
    if (!state) { return false; }
    return state.importedHash !== currentSourceHash;
}

export async function loadManifest(workspaceUri: vscode.Uri): Promise<BridgeManifest> {
    const manifestUri = vscode.Uri.joinPath(workspaceUri, '.github', MANIFEST_FILENAME);
    try {
        const raw = await vscode.workspace.fs.readFile(manifestUri);
        return JSON.parse(Buffer.from(raw).toString('utf-8')) as BridgeManifest;
    } catch {
        return createEmptyManifest();
    }
}

export async function saveManifest(workspaceUri: vscode.Uri, manifest: BridgeManifest): Promise<void> {
    const githubDir = vscode.Uri.joinPath(workspaceUri, '.github');
    await vscode.workspace.fs.createDirectory(githubDir);
    const manifestUri = vscode.Uri.joinPath(githubDir, MANIFEST_FILENAME);
    const content = JSON.stringify(manifest, null, 2);
    await vscode.workspace.fs.writeFile(manifestUri, Buffer.from(content, 'utf-8'));
}

export function recordImport(
    manifest: BridgeManifest,
    skillName: string,
    source: string,
    contentHash: string
): BridgeManifest {
    return {
        ...manifest,
        skills: {
            ...manifest.skills,
            [skillName]: {
                source,
                sourceHash: contentHash,
                importedHash: contentHash,
                importedAt: new Date().toISOString(),
                locallyModified: false,
            },
        },
    };
}

export function removeSkillRecord(manifest: BridgeManifest, skillName: string): BridgeManifest {
    const { [skillName]: _, ...remainingSkills } = manifest.skills;
    return { ...manifest, skills: remainingSkills };
}
```

**Step 4: Run test to verify it passes**

Run: `npm run compile && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/stateManager.ts src/test/stateManager.test.ts
git commit -m "feat: add state manager for tracking skill imports"
```

---

### Task 7: File Writer & Registry Generator

**Files:**
- Create: `src/fileWriter.ts`
- Create: `src/test/fileWriter.test.ts`

**Step 1: Write the failing test**

Create `src/test/fileWriter.test.ts`:

```typescript
import * as assert from 'assert';
import { buildRegistryTable, mergeRegistryIntoInstructions } from '../fileWriter';

describe('buildRegistryTable', () => {
    it('should produce a markdown table from entries', () => {
        const entries = [
            { name: 'brainstorming', trigger: 'Before creative work', file: '.github/instructions/brainstorming.instructions.md' },
            { name: 'tdd', trigger: 'Before implementing', file: '.github/instructions/tdd.instructions.md' },
        ];
        const table = buildRegistryTable(entries);
        assert.ok(table.includes('| Skill | Trigger | File |'));
        assert.ok(table.includes('| brainstorming |'));
        assert.ok(table.includes('| tdd |'));
    });

    it('should return empty section for no entries', () => {
        const table = buildRegistryTable([]);
        assert.ok(table.includes('No skills imported'));
    });
});

describe('mergeRegistryIntoInstructions', () => {
    it('should append registry to empty instructions file', () => {
        const result = mergeRegistryIntoInstructions('', '## Skills\n| table |');
        assert.ok(result.includes('## Skills'));
    });

    it('should replace existing registry section', () => {
        const existing = `# Project Instructions

Some rules here.

<!-- copilot-skill-bridge:start -->
## Old Skills
old table
<!-- copilot-skill-bridge:end -->

More content.`;

        const newRegistry = '## New Skills\nnew table';
        const result = mergeRegistryIntoInstructions(existing, newRegistry);
        assert.ok(result.includes('## New Skills'));
        assert.ok(!result.includes('## Old Skills'));
        assert.ok(result.includes('Some rules here.'));
        assert.ok(result.includes('More content.'));
    });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run compile && npm test`
Expected: FAIL — module '../fileWriter' not found

**Step 3: Write the file writer**

Create `src/fileWriter.ts`:

```typescript
import * as vscode from 'vscode';

interface RegistryEntry {
    name: string;
    trigger: string;
    file: string;
}

const REGISTRY_START = '<!-- copilot-skill-bridge:start -->';
const REGISTRY_END = '<!-- copilot-skill-bridge:end -->';

export function buildRegistryTable(entries: RegistryEntry[]): string {
    if (entries.length === 0) {
        return `## Available Skills\n\nNo skills imported yet.\n`;
    }

    const header = '## Available Skills\n\nWhen working on tasks, consult these skill files for guidance:\n\n';
    const tableHeader = '| Skill | Trigger | File |\n|-------|---------|------|\n';
    const rows = entries
        .map(e => `| ${e.name} | ${e.trigger} | ${e.file} |`)
        .join('\n');

    return header + tableHeader + rows + '\n';
}

export function mergeRegistryIntoInstructions(existingContent: string, registrySection: string): string {
    const wrappedRegistry = `${REGISTRY_START}\n${registrySection}\n${REGISTRY_END}`;

    const startIdx = existingContent.indexOf(REGISTRY_START);
    const endIdx = existingContent.indexOf(REGISTRY_END);

    if (startIdx !== -1 && endIdx !== -1) {
        const before = existingContent.slice(0, startIdx).trimEnd();
        const after = existingContent.slice(endIdx + REGISTRY_END.length).trimStart();
        return [before, '', wrappedRegistry, '', after].filter(s => s !== undefined).join('\n');
    }

    if (existingContent.trim().length === 0) {
        return wrappedRegistry + '\n';
    }

    return existingContent.trimEnd() + '\n\n' + wrappedRegistry + '\n';
}

export async function writeInstructionsFile(
    workspaceUri: vscode.Uri,
    skillName: string,
    content: string
): Promise<void> {
    const dir = vscode.Uri.joinPath(workspaceUri, '.github', 'instructions');
    await vscode.workspace.fs.createDirectory(dir);
    const fileUri = vscode.Uri.joinPath(dir, `${skillName}.instructions.md`);
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));
}

export async function writePromptFile(
    workspaceUri: vscode.Uri,
    skillName: string,
    content: string
): Promise<void> {
    const dir = vscode.Uri.joinPath(workspaceUri, '.github', 'prompts');
    await vscode.workspace.fs.createDirectory(dir);
    const fileUri = vscode.Uri.joinPath(dir, `${skillName}.prompt.md`);
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));
}

export async function updateCopilotInstructions(
    workspaceUri: vscode.Uri,
    entries: RegistryEntry[]
): Promise<void> {
    const githubDir = vscode.Uri.joinPath(workspaceUri, '.github');
    await vscode.workspace.fs.createDirectory(githubDir);
    const instructionsUri = vscode.Uri.joinPath(githubDir, 'copilot-instructions.md');

    let existing = '';
    try {
        const raw = await vscode.workspace.fs.readFile(instructionsUri);
        existing = Buffer.from(raw).toString('utf-8');
    } catch {
        // File doesn't exist yet
    }

    const registry = buildRegistryTable(entries);
    const merged = mergeRegistryIntoInstructions(existing, registry);
    await vscode.workspace.fs.writeFile(instructionsUri, Buffer.from(merged, 'utf-8'));
}

export async function removeSkillFiles(workspaceUri: vscode.Uri, skillName: string): Promise<void> {
    const instructionsFile = vscode.Uri.joinPath(workspaceUri, '.github', 'instructions', `${skillName}.instructions.md`);
    const promptFile = vscode.Uri.joinPath(workspaceUri, '.github', 'prompts', `${skillName}.prompt.md`);

    try { await vscode.workspace.fs.delete(instructionsFile); } catch { /* may not exist */ }
    try { await vscode.workspace.fs.delete(promptFile); } catch { /* may not exist */ }
}
```

**Step 4: Run test to verify it passes**

Run: `npm run compile && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/fileWriter.ts src/test/fileWriter.test.ts
git commit -m "feat: add file writer and registry generator"
```

---

### Task 8: Remote Skill Reader (GitHub API)

**Files:**
- Create: `src/remoteReader.ts`
- Create: `src/test/remoteReader.test.ts`

**Step 1: Write the failing test**

Create `src/test/remoteReader.test.ts`:

```typescript
import * as assert from 'assert';
import { buildGitHubApiUrl, parseGitHubContentsResponse, buildRemoteSkillInfo } from '../remoteReader';

describe('buildGitHubApiUrl', () => {
    it('should build correct contents API URL', () => {
        const url = buildGitHubApiUrl('obra/superpowers', '.claude-plugin/plugin.json');
        assert.strictEqual(url, 'https://api.github.com/repos/obra/superpowers/contents/.claude-plugin/plugin.json');
    });

    it('should build correct URL with ref', () => {
        const url = buildGitHubApiUrl('obra/superpowers', 'skills', 'main');
        assert.strictEqual(url, 'https://api.github.com/repos/obra/superpowers/contents/skills?ref=main');
    });
});

describe('parseGitHubContentsResponse', () => {
    it('should decode base64 content from GitHub API response', () => {
        const response = {
            content: Buffer.from('Hello World').toString('base64'),
            encoding: 'base64',
        };
        const result = parseGitHubContentsResponse(response);
        assert.strictEqual(result, 'Hello World');
    });
});

describe('buildRemoteSkillInfo', () => {
    it('should set source to remote', () => {
        const skill = buildRemoteSkillInfo('tdd', 'TDD skill', '# Content', 'superpowers', '4.3.1', 'obra/superpowers');
        assert.strictEqual(skill.source, 'remote');
        assert.strictEqual(skill.marketplace, 'obra/superpowers');
    });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run compile && npm test`
Expected: FAIL — module '../remoteReader' not found

**Step 3: Write the remote reader**

Create `src/remoteReader.ts`:

```typescript
import { SkillInfo, PluginInfo, PluginJson, MarketplaceJson } from './types';
import { parseSkillFrontmatter } from './parser';

export function buildGitHubApiUrl(repo: string, path: string, ref?: string): string {
    const base = `https://api.github.com/repos/${repo}/contents/${path}`;
    return ref ? `${base}?ref=${ref}` : base;
}

export function parseGitHubContentsResponse(response: { content: string; encoding: string }): string {
    if (response.encoding === 'base64') {
        return Buffer.from(response.content, 'base64').toString('utf-8');
    }
    return response.content;
}

export function buildRemoteSkillInfo(
    name: string,
    description: string,
    content: string,
    pluginName: string,
    pluginVersion: string,
    repo: string
): SkillInfo {
    return {
        name,
        description,
        content,
        pluginName,
        pluginVersion,
        marketplace: repo,
        source: 'remote',
    };
}

async function fetchJson(url: string): Promise<any> {
    const response = await fetch(url, {
        headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'copilot-skill-bridge',
        },
    });
    if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
}

async function fetchFileContent(repo: string, path: string): Promise<string> {
    const url = buildGitHubApiUrl(repo, path);
    const data = await fetchJson(url);
    return parseGitHubContentsResponse(data);
}

export async function discoverRemotePlugins(repo: string): Promise<PluginInfo[]> {
    const plugins: PluginInfo[] = [];

    // Try to read marketplace.json first
    let pluginEntries: Array<{ name: string; description: string; version: string; source: string }> = [];

    try {
        const marketplaceContent = await fetchFileContent(repo, '.claude-plugin/marketplace.json');
        const marketplace: MarketplaceJson = JSON.parse(marketplaceContent);
        pluginEntries = marketplace.plugins;
    } catch {
        // No marketplace.json — treat repo root as a single plugin
        try {
            const pluginContent = await fetchFileContent(repo, '.claude-plugin/plugin.json');
            const pluginMeta: PluginJson = JSON.parse(pluginContent);
            pluginEntries = [{
                name: pluginMeta.name,
                description: pluginMeta.description,
                version: pluginMeta.version,
                source: './',
            }];
        } catch {
            return plugins;
        }
    }

    for (const entry of pluginEntries) {
        const basePath = entry.source === './' ? '' : entry.source.replace(/\/$/, '') + '/';
        const skillsPath = basePath + 'skills';

        // List skill directories
        let skillDirs: Array<{ name: string; type: string }>;
        try {
            const url = buildGitHubApiUrl(repo, skillsPath);
            skillDirs = await fetchJson(url);
        } catch { continue; }

        const skills: SkillInfo[] = [];
        for (const dir of skillDirs) {
            if (dir.type !== 'dir') { continue; }

            try {
                const skillContent = await fetchFileContent(repo, `${skillsPath}/${dir.name}/SKILL.md`);
                const parsed = parseSkillFrontmatter(skillContent);
                skills.push(buildRemoteSkillInfo(
                    parsed.name || dir.name,
                    parsed.description,
                    skillContent,
                    entry.name,
                    entry.version,
                    repo,
                ));
            } catch {
                // SKILL.md doesn't exist in this dir
            }
        }

        plugins.push({
            name: entry.name,
            description: entry.description,
            version: entry.version,
            skills,
            marketplace: repo,
            source: 'remote',
        });
    }

    return plugins;
}

export async function fetchLatestCommitSha(repo: string): Promise<string> {
    const url = `https://api.github.com/repos/${repo}/commits?per_page=1`;
    const commits = await fetchJson(url);
    return commits[0]?.sha ?? '';
}
```

**Step 4: Run test to verify it passes**

Run: `npm run compile && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/remoteReader.ts src/test/remoteReader.test.ts
git commit -m "feat: add remote GitHub skill reader"
```

---

### Task 9: TreeView Provider

**Files:**
- Create: `src/treeView.ts`

**Step 1: Write the TreeView provider**

Create `src/treeView.ts`:

```typescript
import * as vscode from 'vscode';
import { SkillInfo, PluginInfo, SkillStatus } from './types';
import { BridgeManifest } from './types';
import { computeHash, isSkillImported, isSkillOutdated } from './stateManager';

export type TreeItemType = 'plugin' | 'skill';

export class SkillTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly itemType: TreeItemType,
        public readonly pluginInfo?: PluginInfo,
        public readonly skillInfo?: SkillInfo,
        public readonly status?: SkillStatus,
        collapsibleState?: vscode.TreeItemCollapsibleState,
    ) {
        super(label, collapsibleState ?? vscode.TreeItemCollapsibleState.None);

        if (itemType === 'plugin') {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            this.iconPath = new vscode.ThemeIcon('package');
            const src = pluginInfo?.source === 'local' ? 'local' : pluginInfo?.source === 'remote' ? 'remote' : 'local + remote';
            this.description = `v${pluginInfo?.version ?? '?'} [${src}]`;
        } else if (itemType === 'skill') {
            this.contextValue = `skill-${status}`;
            switch (status) {
                case 'synced':
                    this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
                    this.description = 'synced';
                    break;
                case 'available':
                    this.iconPath = new vscode.ThemeIcon('cloud-download');
                    this.description = 'available';
                    break;
                case 'update-available':
                    this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
                    this.description = 'update available';
                    break;
                case 'conflict':
                    this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('list.errorForeground'));
                    this.description = 'conflict';
                    break;
            }
        }
    }
}

export class SkillBridgeTreeProvider implements vscode.TreeDataProvider<SkillTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<SkillTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private plugins: PluginInfo[] = [];
    private manifest: BridgeManifest = { skills: {}, marketplaces: [], settings: { checkInterval: 86400, autoAcceptUpdates: false } };

    setData(plugins: PluginInfo[], manifest: BridgeManifest) {
        this.plugins = plugins;
        this.manifest = manifest;
        this._onDidChangeTreeData.fire();
    }

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: SkillTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: SkillTreeItem): SkillTreeItem[] {
        if (!element) {
            // Root: show plugins
            return this.plugins.map(p => new SkillTreeItem(p.name, 'plugin', p));
        }

        if (element.itemType === 'plugin' && element.pluginInfo) {
            return element.pluginInfo.skills.map(skill => {
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

                return new SkillTreeItem(skill.name, 'skill', element.pluginInfo, skill, status);
            });
        }

        return [];
    }
}
```

**Step 2: Verify it compiles**

Run: `npm run compile`
Expected: No errors

**Step 3: Commit**

```bash
git add src/treeView.ts
git commit -m "feat: add TreeView provider for skill browser sidebar"
```

---

### Task 10: Update Watcher

**Files:**
- Create: `src/updateWatcher.ts`

**Step 1: Write the update watcher**

Create `src/updateWatcher.ts`:

```typescript
import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { BridgeManifest } from './types';
import { computeHash, loadManifest, isSkillOutdated } from './stateManager';
import { fetchLatestCommitSha } from './remoteReader';

export class UpdateWatcher implements vscode.Disposable {
    private localWatcher: vscode.FileSystemWatcher | undefined;
    private remoteTimer: NodeJS.Timeout | undefined;
    private disposables: vscode.Disposable[] = [];

    private _onLocalChange = new vscode.EventEmitter<string>();
    readonly onLocalChange = this._onLocalChange.event;

    private _onRemoteChange = new vscode.EventEmitter<{ repo: string; newSha: string }>();
    readonly onRemoteChange = this._onRemoteChange.event;

    constructor(private cachePath: string) {}

    startLocalWatcher() {
        const resolvedPath = this.cachePath.startsWith('~')
            ? path.join(os.homedir(), this.cachePath.slice(1))
            : this.cachePath;

        // Watch for SKILL.md changes in the cache directory
        const pattern = new vscode.RelativePattern(
            vscode.Uri.file(resolvedPath),
            '**/SKILL.md'
        );

        this.localWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        this.localWatcher.onDidChange(uri => {
            this._onLocalChange.fire(uri.fsPath);
        });

        this.localWatcher.onDidCreate(uri => {
            this._onLocalChange.fire(uri.fsPath);
        });

        this.disposables.push(this.localWatcher);
    }

    startRemoteChecker(repos: string[], intervalSeconds: number, manifest: BridgeManifest) {
        this.stopRemoteChecker();

        const check = async () => {
            for (const repo of repos) {
                try {
                    const latestSha = await fetchLatestCommitSha(repo);
                    const entry = manifest.marketplaces.find(m => m.repo === repo);
                    if (entry && entry.lastChecked !== latestSha) {
                        this._onRemoteChange.fire({ repo, newSha: latestSha });
                    }
                } catch {
                    // Silently skip failed checks
                }
            }
        };

        // Initial check
        check();

        // Periodic checks
        this.remoteTimer = setInterval(check, intervalSeconds * 1000);
    }

    stopRemoteChecker() {
        if (this.remoteTimer) {
            clearInterval(this.remoteTimer);
            this.remoteTimer = undefined;
        }
    }

    dispose() {
        this.stopRemoteChecker();
        this._onLocalChange.dispose();
        this._onRemoteChange.dispose();
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}
```

**Step 2: Verify it compiles**

Run: `npm run compile`
Expected: No errors

**Step 3: Commit**

```bash
git add src/updateWatcher.ts
git commit -m "feat: add update watcher for local cache and remote repos"
```

---

### Task 11: Import Service (Orchestrator)

**Files:**
- Create: `src/importService.ts`

**Step 1: Write the import service**

This orchestrates discovery, conversion, writing, and state management.

Create `src/importService.ts`:

```typescript
import * as vscode from 'vscode';
import { SkillInfo, PluginInfo, ConversionResult, BridgeManifest } from './types';
import { convertSkillContent, generateInstructionsFile, generatePromptFile, generateRegistryEntry } from './converter';
import { parseSkillFrontmatter } from './parser';
import { computeHash, loadManifest, saveManifest, recordImport, removeSkillRecord } from './stateManager';
import { writeInstructionsFile, writePromptFile, updateCopilotInstructions, removeSkillFiles } from './fileWriter';
import { discoverLocalPlugins } from './localReader';
import { discoverRemotePlugins } from './remoteReader';

export class ImportService {
    constructor(private workspaceUri: vscode.Uri) {}

    async discoverAllPlugins(cachePath: string, remoteRepos: string[]): Promise<PluginInfo[]> {
        const localPlugins = await discoverLocalPlugins(cachePath);
        const remoteResults = await Promise.allSettled(
            remoteRepos.map(repo => discoverRemotePlugins(repo))
        );

        const remotePlugins: PluginInfo[] = [];
        for (const result of remoteResults) {
            if (result.status === 'fulfilled') {
                remotePlugins.push(...result.value);
            }
        }

        // Merge: if a plugin exists both locally and remotely, mark source as 'both'
        const merged = new Map<string, PluginInfo>();

        for (const p of localPlugins) {
            merged.set(p.name, p);
        }

        for (const p of remotePlugins) {
            const existing = merged.get(p.name);
            if (existing) {
                existing.source = 'both';
                // Merge skills: prefer local content, add remote-only skills
                const existingNames = new Set(existing.skills.map(s => s.name));
                for (const skill of p.skills) {
                    if (!existingNames.has(skill.name)) {
                        existing.skills.push(skill);
                    }
                }
            } else {
                merged.set(p.name, p);
            }
        }

        return Array.from(merged.values());
    }

    convertSkill(skill: SkillInfo): ConversionResult {
        const parsed = parseSkillFrontmatter(skill.content);
        const convertedBody = convertSkillContent(parsed.body);

        return {
            instructionsContent: generateInstructionsFile(skill.name, skill.description, convertedBody),
            promptContent: generatePromptFile(skill.name, skill.description, convertedBody),
            registryEntry: generateRegistryEntry(skill.name, skill.description),
            originalContent: skill.content,
        };
    }

    async importSkill(skill: SkillInfo, outputFormats: string[], generateRegistry: boolean): Promise<void> {
        const conversion = this.convertSkill(skill);
        const hash = computeHash(skill.content);
        const source = `${skill.pluginName}@${skill.marketplace}`;

        // Show diff preview
        const accepted = await this.showPreview(skill, conversion);
        if (!accepted) { return; }

        // Write files
        if (outputFormats.includes('instructions')) {
            await writeInstructionsFile(this.workspaceUri, skill.name, conversion.instructionsContent);
        }
        if (outputFormats.includes('prompts')) {
            await writePromptFile(this.workspaceUri, skill.name, conversion.promptContent);
        }

        // Update manifest
        let manifest = await loadManifest(this.workspaceUri);
        manifest = recordImport(manifest, skill.name, source, hash);
        await saveManifest(this.workspaceUri, manifest);

        // Update registry
        if (generateRegistry) {
            const entries = Object.entries(manifest.skills).map(([name, state]) => {
                const skillData = this.findSkillByName(name);
                return generateRegistryEntry(name, skillData?.description ?? '');
            });
            await updateCopilotInstructions(this.workspaceUri, entries);
        }

        vscode.window.showInformationMessage(`Imported skill: ${skill.name}`);
    }

    async removeSkill(skillName: string, generateRegistry: boolean): Promise<void> {
        await removeSkillFiles(this.workspaceUri, skillName);

        let manifest = await loadManifest(this.workspaceUri);
        manifest = removeSkillRecord(manifest, skillName);
        await saveManifest(this.workspaceUri, manifest);

        if (generateRegistry) {
            const entries = Object.entries(manifest.skills).map(([name]) => {
                return generateRegistryEntry(name, '');
            });
            await updateCopilotInstructions(this.workspaceUri, entries);
        }

        vscode.window.showInformationMessage(`Removed skill: ${skillName}`);
    }

    private async showPreview(skill: SkillInfo, conversion: ConversionResult): Promise<boolean> {
        const originalDoc = await vscode.workspace.openTextDocument({
            content: skill.content,
            language: 'markdown',
        });
        const convertedDoc = await vscode.workspace.openTextDocument({
            content: conversion.instructionsContent,
            language: 'markdown',
        });

        await vscode.commands.executeCommand(
            'vscode.diff',
            originalDoc.uri,
            convertedDoc.uri,
            `${skill.name}: Claude → Copilot`
        );

        const choice = await vscode.window.showInformationMessage(
            `Import "${skill.name}" with the shown conversion?`,
            'Accept',
            'Cancel'
        );

        return choice === 'Accept';
    }

    private allPlugins: PluginInfo[] = [];

    setPlugins(plugins: PluginInfo[]) {
        this.allPlugins = plugins;
    }

    private findSkillByName(name: string): SkillInfo | undefined {
        for (const plugin of this.allPlugins) {
            const skill = plugin.skills.find(s => s.name === name);
            if (skill) { return skill; }
        }
        return undefined;
    }
}
```

**Step 2: Verify it compiles**

Run: `npm run compile`
Expected: No errors

**Step 3: Commit**

```bash
git add src/importService.ts
git commit -m "feat: add import service orchestrator"
```

---

### Task 12: Extension Entry Point (Wire Everything Together)

**Files:**
- Modify: `src/extension.ts`

**Step 1: Write the full extension activation**

Replace `src/extension.ts`:

```typescript
import * as vscode from 'vscode';
import { SkillBridgeTreeProvider, SkillTreeItem } from './treeView';
import { ImportService } from './importService';
import { UpdateWatcher } from './updateWatcher';
import { loadManifest } from './stateManager';

let updateWatcher: UpdateWatcher | undefined;

export async function activate(context: vscode.ExtensionContext) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return;
    }

    const config = vscode.workspace.getConfiguration('copilotSkillBridge');
    const cachePath = config.get<string>('claudeCachePath', '~/.claude/plugins/cache');
    const remoteRepos = config.get<string[]>('marketplaces', ['obra/superpowers']);
    const checkInterval = config.get<number>('checkInterval', 86400);
    const outputFormats = config.get<string[]>('outputFormats', ['instructions', 'prompts']);
    const generateRegistry = config.get<boolean>('generateRegistry', true);

    const workspaceUri = workspaceFolder.uri;
    const importService = new ImportService(workspaceUri);
    const treeProvider = new SkillBridgeTreeProvider();

    // Register TreeView
    const treeView = vscode.window.createTreeView('skillBridgeExplorer', {
        treeDataProvider: treeProvider,
        showCollapseAll: true,
    });
    context.subscriptions.push(treeView);

    // Initial discovery
    async function refreshAll() {
        const plugins = await importService.discoverAllPlugins(cachePath, remoteRepos);
        importService.setPlugins(plugins);
        const manifest = await loadManifest(workspaceUri);
        treeProvider.setData(plugins, manifest);
    }

    await refreshAll();

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('copilotSkillBridge.importSkill', async (item?: SkillTreeItem) => {
            if (item?.skillInfo) {
                await importService.importSkill(item.skillInfo, outputFormats, generateRegistry);
                await refreshAll();
            } else {
                vscode.window.showWarningMessage('Select a skill from the Copilot Skill Bridge sidebar.');
            }
        }),

        vscode.commands.registerCommand('copilotSkillBridge.importAllSkills', async (item?: SkillTreeItem) => {
            const plugin = item?.pluginInfo;
            if (!plugin) {
                vscode.window.showWarningMessage('Select a plugin from the Copilot Skill Bridge sidebar.');
                return;
            }
            for (const skill of plugin.skills) {
                await importService.importSkill(skill, outputFormats, generateRegistry);
            }
            await refreshAll();
        }),

        vscode.commands.registerCommand('copilotSkillBridge.checkForUpdates', async () => {
            await refreshAll();
            vscode.window.showInformationMessage('Skill Bridge: Update check complete.');
        }),

        vscode.commands.registerCommand('copilotSkillBridge.addMarketplace', async () => {
            const repo = await vscode.window.showInputBox({
                prompt: 'Enter GitHub repo (owner/name)',
                placeHolder: 'obra/superpowers',
                validateInput: (value) => {
                    return /^[\w.-]+\/[\w.-]+$/.test(value) ? null : 'Format: owner/repo-name';
                },
            });
            if (repo) {
                const current = config.get<string[]>('marketplaces', []);
                if (!current.includes(repo)) {
                    await config.update('marketplaces', [...current, repo], vscode.ConfigurationTarget.Global);
                    await refreshAll();
                    vscode.window.showInformationMessage(`Added marketplace: ${repo}`);
                }
            }
        }),

        vscode.commands.registerCommand('copilotSkillBridge.removeSkill', async (item?: SkillTreeItem) => {
            if (item?.skillInfo) {
                await importService.removeSkill(item.skillInfo.name, generateRegistry);
                await refreshAll();
            }
        }),

        vscode.commands.registerCommand('copilotSkillBridge.rebuildRegistry', async () => {
            const manifest = await loadManifest(workspaceUri);
            const { generateRegistryEntry } = await import('./converter');
            const entries = Object.keys(manifest.skills).map(name => {
                return generateRegistryEntry(name, '');
            });
            const { updateCopilotInstructions } = await import('./fileWriter');
            await updateCopilotInstructions(workspaceUri, entries);
            vscode.window.showInformationMessage('Skill registry rebuilt.');
        }),
    );

    // Start update watcher
    updateWatcher = new UpdateWatcher(cachePath);
    updateWatcher.startLocalWatcher();
    updateWatcher.startRemoteChecker(remoteRepos, checkInterval, await loadManifest(workspaceUri));

    updateWatcher.onLocalChange(async (filePath) => {
        const choice = await vscode.window.showInformationMessage(
            `Skill source changed: ${filePath}. Refresh and check for updates?`,
            'Review', 'Skip'
        );
        if (choice === 'Review') {
            await refreshAll();
        }
    });

    updateWatcher.onRemoteChange(async ({ repo }) => {
        const choice = await vscode.window.showInformationMessage(
            `Marketplace "${repo}" has updates. Refresh skills?`,
            'Review', 'Skip'
        );
        if (choice === 'Review') {
            await refreshAll();
        }
    });

    context.subscriptions.push(updateWatcher);

    // Listen for config changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('copilotSkillBridge')) {
                refreshAll();
            }
        })
    );
}

export function deactivate() {
    updateWatcher?.dispose();
}
```

**Step 2: Verify it compiles**

Run: `npm run compile`
Expected: No errors

**Step 3: Test manually in VS Code**

Run: Press F5 in VS Code to launch Extension Development Host
Expected: "Copilot Skill Bridge" appears in the Activity Bar sidebar

**Step 4: Commit**

```bash
git add src/extension.ts
git commit -m "feat: wire extension entry point with all components"
```

---

### Task 13: Add Context Menu Actions to TreeView

**Files:**
- Modify: `package.json` (add menus contribution)

**Step 1: Add context menus to package.json**

Add to `contributes` section in `package.json`:

```json
"menus": {
    "view/item/context": [
        {
            "command": "copilotSkillBridge.importSkill",
            "when": "view == skillBridgeExplorer && viewItem =~ /^skill-(available|update-available)/",
            "group": "inline"
        },
        {
            "command": "copilotSkillBridge.removeSkill",
            "when": "view == skillBridgeExplorer && viewItem =~ /^skill-(synced|conflict)/",
            "group": "inline"
        },
        {
            "command": "copilotSkillBridge.importAllSkills",
            "when": "view == skillBridgeExplorer && viewItem == plugin"
        }
    ],
    "view/title": [
        {
            "command": "copilotSkillBridge.checkForUpdates",
            "when": "view == skillBridgeExplorer",
            "group": "navigation"
        },
        {
            "command": "copilotSkillBridge.addMarketplace",
            "when": "view == skillBridgeExplorer"
        }
    ]
}
```

**Step 2: Add command icons to package.json commands**

Update the commands array to include icons:

```json
{ "command": "copilotSkillBridge.importSkill", "title": "Import Skill", "icon": "$(cloud-download)" },
{ "command": "copilotSkillBridge.removeSkill", "title": "Remove Skill", "icon": "$(trash)" },
{ "command": "copilotSkillBridge.checkForUpdates", "title": "Check for Updates", "icon": "$(refresh)" },
{ "command": "copilotSkillBridge.addMarketplace", "title": "Add Marketplace", "icon": "$(add)" }
```

**Step 3: Verify it compiles**

Run: `npm run compile`
Expected: No errors

**Step 4: Commit**

```bash
git add package.json
git commit -m "feat: add context menus and icons to TreeView"
```

---

### Task 14: End-to-End Smoke Test

**Step 1: Launch extension in debug mode**

Press F5 in VS Code with the CopilotBridge project open.

**Step 2: Verify sidebar appears**

Expected: "Copilot Skill Bridge" icon in Activity Bar, clicking it shows the TreeView

**Step 3: Verify local skills discovered**

Expected: If `~/.claude/plugins/cache/` has plugins, they appear in the tree with correct versions

**Step 4: Test importing a skill**

Click a skill → "Import Skill" → Preview diff → Accept
Expected: Files created at `.github/instructions/` and `.github/prompts/`, registry added to `.github/copilot-instructions.md`

**Step 5: Verify Copilot picks up the files**

Open Copilot Chat in the Extension Development Host → the instructions should be active

**Step 6: Final commit**

```bash
git add -A
git commit -m "chore: complete initial implementation of Copilot Skill Bridge"
```
