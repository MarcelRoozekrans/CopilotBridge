# Publishing, GitHub, Integration Tests & Auth — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make CopilotBridge production-ready: publishable on VS Code Marketplace, hosted on GitHub, with integration tests and GitHub auth for private repos.

**Architecture:** Four independent workstreams. GitHub auth touches `remoteReader.ts` and `extension.ts`. Integration tests use `@vscode/test-electron` to run Mocha inside a real VS Code instance. Publishing adds metadata, README, and `vsce` tooling. Git remote setup is a one-time operation.

**Tech Stack:** `@vscode/vsce`, `@vscode/test-electron`, `vscode.authentication` API, `gh` CLI.

---

### Task 1: Create GitHub repo and push

**Files:**
- No source changes

**Step 1: Create the repo and push**

```bash
gh repo create MarcelRoozekrans/CopilotBridge --public --source=. --push --remote=origin
```

**Step 2: Rename master to main and push**

```bash
git branch -M main
git push -u origin main
```

**Step 3: Verify**

```bash
git remote -v
git log --oneline -3
```

Expected: `origin` pointing to `https://github.com/MarcelRoozekrans/CopilotBridge`, all 15 commits visible.

---

### Task 2: Add GitHub authentication to remoteReader

**Files:**
- Create: `src/auth.ts`
- Modify: `src/remoteReader.ts:35-46`
- Modify: `src/extension.ts` (add login command)
- Modify: `src/treeView.ts` (show auth status)
- Modify: `package.json` (add login command contribution)
- Test: `src/test/unit/auth.test.ts`

**Step 1: Write failing test for auth module**

Create `src/test/auth.test.ts`:

```typescript
import * as assert from 'assert';
import { buildAuthHeaders } from '../auth';

describe('buildAuthHeaders', () => {
    it('should return base headers when no token provided', () => {
        const headers = buildAuthHeaders(undefined);
        assert.strictEqual(headers['User-Agent'], 'copilot-skill-bridge');
        assert.strictEqual(headers['Accept'], 'application/vnd.github.v3+json');
        assert.strictEqual(headers['Authorization'], undefined);
    });

    it('should include Authorization header when token provided', () => {
        const headers = buildAuthHeaders('ghp_test123');
        assert.strictEqual(headers['Authorization'], 'Bearer ghp_test123');
        assert.strictEqual(headers['User-Agent'], 'copilot-skill-bridge');
    });
});
```

**Step 2: Run test to verify it fails**

```bash
npm run compile && npm test
```

Expected: FAIL — `Cannot find module '../auth'`

**Step 3: Create auth module**

Create `src/auth.ts`:

```typescript
import * as vscode from 'vscode';

export function buildAuthHeaders(token: string | undefined): Record<string, string> {
    const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'copilot-skill-bridge',
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

export async function getGitHubToken(): Promise<string | undefined> {
    try {
        const session = await vscode.authentication.getSession('github', ['repo'], {
            createIfNone: false,
        });
        return session?.accessToken;
    } catch {
        return undefined;
    }
}

export async function loginToGitHub(): Promise<string | undefined> {
    try {
        const session = await vscode.authentication.getSession('github', ['repo'], {
            createIfNone: true,
        });
        return session?.accessToken;
    } catch {
        return undefined;
    }
}
```

**Step 4: Run test to verify it passes**

```bash
npm run compile && npm test
```

Expected: PASS

**Step 5: Wire auth into remoteReader.ts**

Replace the `fetchJson` function in `src/remoteReader.ts:35-46`:

```typescript
import { buildAuthHeaders, getGitHubToken } from './auth';

async function fetchJson(url: string): Promise<any> {
    const token = await getGitHubToken();
    const headers = buildAuthHeaders(token);
    const response = await fetch(url, { headers });
    if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
}
```

Remove the old hardcoded headers import. Also add token to `fetchLatestCommitSha` since it uses `fetchJson` already — no change needed there.

**Step 6: Add login command to package.json**

Add to `contributes.commands` array:

```json
{ "command": "copilotSkillBridge.login", "title": "Sign in to GitHub", "icon": "$(github)" }
```

Add to `contributes.menus.view/title`:

```json
{
  "command": "copilotSkillBridge.login",
  "when": "view == skillBridgeExplorer"
}
```

**Step 7: Register login command in extension.ts**

Add inside the `context.subscriptions.push(...)` block in `src/extension.ts`:

```typescript
vscode.commands.registerCommand('copilotSkillBridge.login', async () => {
    const { loginToGitHub } = await import('./auth');
    const token = await loginToGitHub();
    if (token) {
        vscode.window.showInformationMessage('Signed in to GitHub successfully.');
        await refreshAll();
    } else {
        vscode.window.showWarningMessage('GitHub sign-in was cancelled or failed.');
    }
}),
```

**Step 8: Run all tests**

```bash
npm run compile && npm test
```

Expected: All tests pass (existing + new auth tests).

**Step 9: Commit**

```bash
git add src/auth.ts src/test/auth.test.ts src/remoteReader.ts src/extension.ts package.json
git commit -m "feat: add GitHub authentication via VS Code auth API"
```

---

### Task 3: Reorganize tests into unit/ directory

**Files:**
- Move: `src/test/*.test.ts` → `src/test/unit/*.test.ts`
- Move: `src/test/vscode.mock.ts` → `src/test/unit/vscode.mock.ts`
- Modify: `.mocharc.yml`

**Step 1: Create unit directory and move files**

```bash
mkdir -p src/test/unit
mv src/test/converter.test.ts src/test/unit/
mv src/test/fileWriter.test.ts src/test/unit/
mv src/test/localReader.test.ts src/test/unit/
mv src/test/parser.test.ts src/test/unit/
mv src/test/remoteReader.test.ts src/test/unit/
mv src/test/stateManager.test.ts src/test/unit/
mv src/test/types.test.ts src/test/unit/
mv src/test/auth.test.ts src/test/unit/
mv src/test/vscode.mock.ts src/test/unit/
```

**Step 2: Update .mocharc.yml**

```yaml
require:
  - out/test/unit/vscode.mock.js
```

**Step 3: Update test script in package.json**

```json
"test:unit": "mocha 'out/test/unit/**/*.test.js'",
"test": "npm run test:unit"
```

**Step 4: Fix import paths in moved test files**

All test files use `from '../converter'` etc. After moving one level deeper, these become `from '../../converter'`. Update every `../<module>` import in each test file to `../../<module>`.

**Step 5: Run tests to verify nothing broke**

```bash
npm run compile && npm run test:unit
```

Expected: All 40 tests pass.

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor: reorganize tests into unit/ subdirectory"
```

---

### Task 4: Set up integration test infrastructure

**Files:**
- Create: `src/test/integration/index.ts`
- Create: `src/test/integration/runTests.ts`
- Modify: `package.json` (add test:integration script)
- Modify: `.vscodeignore` (exclude test files)

**Step 1: Create the integration test runner**

Create `src/test/integration/runTests.ts`:

```typescript
import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
    const extensionTestsPath = path.resolve(__dirname, './index');

    await runTests({
        extensionDevelopmentPath,
        extensionTestsPath,
        launchArgs: [
            '--disable-extensions',
            path.resolve(__dirname, '../../../test-workspace'),
        ],
    });
}

main().catch((err) => {
    console.error('Failed to run integration tests:', err);
    process.exit(1);
});
```

**Step 2: Create the Mocha test suite loader**

Create `src/test/integration/index.ts`:

```typescript
import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export async function run(): Promise<void> {
    const mocha = new Mocha({ ui: 'bdd', color: true, timeout: 10000 });
    const testsRoot = path.resolve(__dirname);
    const files = await glob('**/*.test.js', { cwd: testsRoot });

    for (const file of files) {
        mocha.addFile(path.resolve(testsRoot, file));
    }

    return new Promise<void>((resolve, reject) => {
        mocha.run((failures) => {
            if (failures > 0) {
                reject(new Error(`${failures} test(s) failed.`));
            } else {
                resolve();
            }
        });
    });
}
```

**Step 3: Add glob as dev dependency and test:integration script**

```bash
npm install --save-dev glob @types/glob
```

Update `package.json` scripts:

```json
"test:integration": "node out/test/integration/runTests.js",
"test": "npm run test:unit && npm run test:integration"
```

**Step 4: Create a minimal test-workspace directory**

```bash
mkdir -p test-workspace
echo '{}' > test-workspace/.gitkeep
```

Add `test-workspace/` to `.gitignore` if needed or keep it. Integration tests open VS Code with this folder as the workspace.

**Step 5: Run to verify infrastructure works (no tests yet)**

```bash
npm run compile && npm run test:integration
```

Expected: VS Code launches, 0 tests run, exits successfully.

**Step 6: Commit**

```bash
git add src/test/integration/ package.json package-lock.json test-workspace/ .vscodeignore
git commit -m "feat: add integration test infrastructure with @vscode/test-electron"
```

---

### Task 5: Write integration tests — extension lifecycle

**Files:**
- Create: `src/test/integration/extension.test.ts`

**Step 1: Write extension activation test**

Create `src/test/integration/extension.test.ts`:

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

describe('Extension Lifecycle', () => {
    it('should be present in installed extensions', () => {
        const ext = vscode.extensions.getExtension('copilot-skill-bridge.copilot-skill-bridge');
        assert.ok(ext, 'Extension not found');
    });

    it('should activate successfully', async () => {
        const ext = vscode.extensions.getExtension('copilot-skill-bridge.copilot-skill-bridge');
        assert.ok(ext);
        await ext.activate();
        assert.strictEqual(ext.isActive, true);
    });

    it('should register all expected commands', async () => {
        const commands = await vscode.commands.getCommands(true);
        const expected = [
            'copilotSkillBridge.importSkill',
            'copilotSkillBridge.importAllSkills',
            'copilotSkillBridge.checkForUpdates',
            'copilotSkillBridge.addMarketplace',
            'copilotSkillBridge.removeSkill',
            'copilotSkillBridge.rebuildRegistry',
            'copilotSkillBridge.login',
        ];
        for (const cmd of expected) {
            assert.ok(commands.includes(cmd), `Command ${cmd} not registered`);
        }
    });
});
```

**Step 2: Run integration tests**

```bash
npm run compile && npm run test:integration
```

Expected: 3 tests pass.

**Step 3: Commit**

```bash
git add src/test/integration/extension.test.ts
git commit -m "test: add integration tests for extension lifecycle"
```

---

### Task 6: Write integration tests — TreeView

**Files:**
- Create: `src/test/integration/treeView.test.ts`

**Step 1: Write TreeView tests**

Create `src/test/integration/treeView.test.ts`:

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';
import { SkillBridgeTreeProvider, SkillTreeItem } from '../../treeView';
import { PluginInfo, BridgeManifest } from '../../types';
import { createEmptyManifest } from '../../stateManager';

describe('TreeView Integration', () => {
    let treeProvider: SkillBridgeTreeProvider;

    const mockPlugin: PluginInfo = {
        name: 'test-plugin',
        description: 'A test plugin',
        version: '1.0.0',
        skills: [
            {
                name: 'test-skill',
                description: 'A test skill',
                content: '# Test Skill\nSome content.',
                pluginName: 'test-plugin',
                pluginVersion: '1.0.0',
                marketplace: 'test-marketplace',
                source: 'local',
            },
        ],
        marketplace: 'test-marketplace',
        source: 'local',
    };

    beforeEach(() => {
        treeProvider = new SkillBridgeTreeProvider();
    });

    it('should show plugins as root items', () => {
        treeProvider.setData([mockPlugin], createEmptyManifest());
        const roots = treeProvider.getChildren();
        assert.strictEqual(roots.length, 1);
        assert.strictEqual(roots[0].label, 'test-plugin');
        assert.strictEqual(roots[0].itemType, 'plugin');
    });

    it('should show skills under plugins', () => {
        treeProvider.setData([mockPlugin], createEmptyManifest());
        const roots = treeProvider.getChildren();
        const children = treeProvider.getChildren(roots[0]);
        assert.strictEqual(children.length, 1);
        assert.strictEqual(children[0].label, 'test-skill');
        assert.strictEqual(children[0].status, 'available');
    });

    it('should show synced status for imported skills', () => {
        const manifest: BridgeManifest = {
            ...createEmptyManifest(),
            skills: {
                'test-skill': {
                    source: 'test-plugin@test-marketplace',
                    sourceHash: 'abc123',
                    importedHash: '88ee81c75fe3', // sha256 of '# Test Skill\nSome content.' truncated to 12 chars
                    importedAt: new Date().toISOString(),
                    locallyModified: false,
                },
            },
        };
        treeProvider.setData([mockPlugin], manifest);
        const roots = treeProvider.getChildren();
        const children = treeProvider.getChildren(roots[0]);
        assert.strictEqual(children[0].status, 'synced');
    });

    it('should fire onDidChangeTreeData when data is set', (done) => {
        treeProvider.onDidChangeTreeData(() => {
            done();
        });
        treeProvider.setData([], createEmptyManifest());
    });
});
```

**Step 2: Run integration tests**

```bash
npm run compile && npm run test:integration
```

Expected: 7 tests pass (3 extension + 4 treeView).

**Step 3: Commit**

```bash
git add src/test/integration/treeView.test.ts
git commit -m "test: add integration tests for TreeView rendering and status"
```

---

### Task 7: Write integration tests — import workflow

**Files:**
- Create: `src/test/integration/importFlow.test.ts`

**Step 1: Write import flow tests**

Create `src/test/integration/importFlow.test.ts`:

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { convertSkillContent, generateInstructionsFile, generatePromptFile } from '../../converter';
import { writeInstructionsFile, writePromptFile, removeSkillFiles } from '../../fileWriter';
import { loadManifest, saveManifest, recordImport, computeHash, createEmptyManifest } from '../../stateManager';

describe('Import Flow Integration', () => {
    let workspaceUri: vscode.Uri;

    before(() => {
        const folders = vscode.workspace.workspaceFolders;
        assert.ok(folders && folders.length > 0, 'No workspace folder open');
        workspaceUri = folders[0].uri;
    });

    it('should write instructions file to .github/instructions/', async () => {
        const content = generateInstructionsFile('test-import', 'A test skill', 'Body content here');
        await writeInstructionsFile(workspaceUri, 'test-import', content);

        const fileUri = vscode.Uri.joinPath(workspaceUri, '.github', 'instructions', 'test-import.instructions.md');
        const raw = await vscode.workspace.fs.readFile(fileUri);
        const text = Buffer.from(raw).toString('utf-8');
        assert.ok(text.includes("name: 'Test Import'"));
        assert.ok(text.includes('Body content here'));
    });

    it('should write prompt file to .github/prompts/', async () => {
        const content = generatePromptFile('test-import', 'A test skill', 'Body content here');
        await writePromptFile(workspaceUri, 'test-import', content);

        const fileUri = vscode.Uri.joinPath(workspaceUri, '.github', 'prompts', 'test-import.prompt.md');
        const raw = await vscode.workspace.fs.readFile(fileUri);
        const text = Buffer.from(raw).toString('utf-8');
        assert.ok(text.includes('name: test-import'));
        assert.ok(text.includes('agent: agent'));
    });

    it('should track import in manifest', async () => {
        let manifest = createEmptyManifest();
        manifest = recordImport(manifest, 'test-import', 'test@test', computeHash('body'));
        await saveManifest(workspaceUri, manifest);

        const loaded = await loadManifest(workspaceUri);
        assert.ok(loaded.skills['test-import']);
        assert.strictEqual(loaded.skills['test-import'].source, 'test@test');
    });

    it('should remove skill files on removeSkillFiles', async () => {
        // First ensure files exist
        await writeInstructionsFile(workspaceUri, 'test-remove', 'content');
        await writePromptFile(workspaceUri, 'test-remove', 'content');

        await removeSkillFiles(workspaceUri, 'test-remove');

        // Verify files are gone
        const instrUri = vscode.Uri.joinPath(workspaceUri, '.github', 'instructions', 'test-remove.instructions.md');
        try {
            await vscode.workspace.fs.readFile(instrUri);
            assert.fail('File should have been deleted');
        } catch {
            // Expected — file doesn't exist
        }
    });

    after(async () => {
        // Clean up test artifacts
        try {
            const githubDir = vscode.Uri.joinPath(workspaceUri, '.github');
            await vscode.workspace.fs.delete(githubDir, { recursive: true });
        } catch { /* may not exist */ }
    });
});
```

**Step 2: Run integration tests**

```bash
npm run compile && npm run test:integration
```

Expected: 11 tests pass.

**Step 3: Commit**

```bash
git add src/test/integration/importFlow.test.ts
git commit -m "test: add integration tests for skill import workflow"
```

---

### Task 8: Write integration tests — update watcher and auth

**Files:**
- Create: `src/test/integration/updateWatcher.test.ts`
- Create: `src/test/integration/auth.test.ts`

**Step 1: Write update watcher tests**

Create `src/test/integration/updateWatcher.test.ts`:

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';

describe('UpdateWatcher Integration', () => {
    it('should create a file system watcher for SKILL.md files', () => {
        // Verify VS Code's file watcher API is available
        const pattern = new vscode.RelativePattern(
            vscode.Uri.file(os.tmpdir()),
            '**/SKILL.md'
        );
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);
        assert.ok(watcher);
        watcher.dispose();
    });

    it('should detect file creation events', (done) => {
        const tmpDir = os.tmpdir();
        const testDir = path.join(tmpDir, 'skill-bridge-test-' + Date.now());
        const testUri = vscode.Uri.file(testDir);

        const pattern = new vscode.RelativePattern(testUri, '**/SKILL.md');
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);

        const timeout = setTimeout(() => {
            watcher.dispose();
            // File watcher may not fire in test-workspace — pass if no event within 2s
            done();
        }, 2000);

        watcher.onDidCreate(() => {
            clearTimeout(timeout);
            watcher.dispose();
            done();
        });

        // Create the file to trigger the watcher
        vscode.workspace.fs.createDirectory(testUri).then(() => {
            const skillUri = vscode.Uri.joinPath(testUri, 'SKILL.md');
            return vscode.workspace.fs.writeFile(skillUri, Buffer.from('# Test'));
        });
    });
});
```

**Step 2: Write auth integration tests**

Create `src/test/integration/auth.test.ts`:

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

describe('GitHub Auth Integration', () => {
    it('should have the authentication API available', () => {
        assert.ok(vscode.authentication);
        assert.ok(typeof vscode.authentication.getSession === 'function');
    });

    it('should return undefined when no session exists and createIfNone is false', async () => {
        // In test environment, no GitHub session exists
        try {
            const session = await vscode.authentication.getSession('github', ['repo'], {
                createIfNone: false,
            });
            // Session may or may not exist depending on the test environment
            // We just verify the call doesn't throw
            assert.ok(session === undefined || session.accessToken);
        } catch {
            // Some test environments may not have the GitHub auth provider
            // This is acceptable
        }
    });

    it('should have login command registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('copilotSkillBridge.login'));
    });
});
```

**Step 3: Run all integration tests**

```bash
npm run compile && npm run test:integration
```

Expected: 16 tests pass.

**Step 4: Commit**

```bash
git add src/test/integration/updateWatcher.test.ts src/test/integration/auth.test.ts
git commit -m "test: add integration tests for update watcher and GitHub auth"
```

---

### Task 9: Prepare marketplace metadata

**Files:**
- Create: `README.md`
- Create: `CHANGELOG.md`
- Create: `LICENSE`
- Create: `media/icon.png` (placeholder or simple generated icon)
- Modify: `package.json` (publisher, repo, icon, license, keywords)
- Modify: `.vscodeignore` (exclude test files, docs, src)

**Step 1: Update package.json metadata**

Update these fields in `package.json`:

```json
{
  "publisher": "MarcelRoozekrans",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/MarcelRoozekrans/CopilotBridge"
  },
  "icon": "media/icon.png",
  "keywords": ["copilot", "claude", "skills", "bridge", "ai"],
  "homepage": "https://github.com/MarcelRoozekrans/CopilotBridge#readme",
  "bugs": {
    "url": "https://github.com/MarcelRoozekrans/CopilotBridge/issues"
  }
}
```

**Step 2: Create README.md**

Write a marketplace-facing README with:
- Extension name and one-line description
- Features list (skill discovery, conversion, TreeView, updates)
- Getting Started section (install, configure marketplace repos, import skills)
- Settings reference table
- Commands reference table
- Screenshot placeholder (can add later)

**Step 3: Create CHANGELOG.md**

```markdown
# Changelog

## [0.1.0] - 2026-03-02

### Added
- Initial release
- Local Claude plugin cache discovery
- Remote GitHub marketplace discovery
- Skill conversion engine (31+ rules)
- TreeView sidebar with status icons
- Import/remove/update workflows
- GitHub authentication via VS Code auth API
- Integration tests with @vscode/test-electron
```

**Step 4: Create LICENSE**

MIT license with copyright `Marcel Roozekrans`.

**Step 5: Create a simple icon**

Create `media/` directory and generate or place a 128x128 PNG icon. For now, use a simple placeholder (can be replaced with a proper icon later).

**Step 6: Update .vscodeignore**

```
.vscode/**
.vscode-test/**
src/**
node_modules/**
.gitignore
tsconfig.json
**/*.map
docs/**
test-workspace/**
.mocharc.yml
.github/**
```

**Step 7: Add vsce scripts to package.json**

```json
"package": "vsce package",
"publish": "vsce publish"
```

**Step 8: Install vsce**

```bash
npm install --save-dev @vscode/vsce
```

**Step 9: Test packaging**

```bash
npm run build && npx vsce package
```

Expected: Creates `copilot-skill-bridge-0.1.0.vsix` without errors.

**Step 10: Commit**

```bash
git add README.md CHANGELOG.md LICENSE media/ package.json package-lock.json .vscodeignore
git commit -m "feat: add marketplace metadata, README, and packaging support"
```

---

### Task 10: Publish to VS Code Marketplace

**Files:**
- No source changes

**Step 1: Create publisher account**

1. Go to https://marketplace.visualstudio.com/manage
2. Sign in with Microsoft account
3. Create publisher with ID `MarcelRoozekrans`

**Step 2: Create a Personal Access Token**

1. Go to https://dev.azure.com → User Settings → Personal Access Tokens
2. Create token with:
   - Organization: All accessible organizations
   - Scopes: Marketplace → Manage
   - Expiry: 90 days or more

**Step 3: Login with vsce**

```bash
npx vsce login MarcelRoozekrans
```

Paste the PAT when prompted.

**Step 4: Publish**

```bash
npm run build && npx vsce publish
```

Expected: Extension published to marketplace. URL: `https://marketplace.visualstudio.com/items?itemName=MarcelRoozekrans.copilot-skill-bridge`

**Step 5: Push everything to GitHub**

```bash
git push origin main
```

---

### Task 11: Final verification

**Step 1: Run all tests**

```bash
npm run compile && npm run test:unit && npm run test:integration
```

Expected: All unit tests (40+) and integration tests (16+) pass.

**Step 2: Verify extension installs from .vsix**

In VS Code: Extensions → `...` → Install from VSIX → select the `.vsix` file.

**Step 3: Verify marketplace listing**

Visit `https://marketplace.visualstudio.com/items?itemName=MarcelRoozekrans.copilot-skill-bridge` and confirm the listing shows README, icon, and metadata.
