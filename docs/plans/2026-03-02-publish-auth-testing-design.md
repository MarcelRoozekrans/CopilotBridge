# CopilotBridge — Publishing, GitHub Setup, Integration Tests & Auth Design

**Date:** 2026-03-02
**Status:** Approved

## Overview

Four enhancements to make CopilotBridge production-ready:

1. Publish to VS Code Marketplace (with new publisher account)
2. Push to `MarcelRoozekrans/CopilotBridge` on GitHub
3. Integration tests using `@vscode/test-electron`
4. GitHub authentication via `vscode.authentication` API

---

## 1. VS Code Marketplace Publishing

### Publisher Account

Create a publisher at https://marketplace.visualstudio.com/manage using a Microsoft/Azure DevOps account. Generate a Personal Access Token (PAT) with `Marketplace > Manage` scope for `vsce`.

### Package Metadata

Update `package.json`:

```json
{
  "publisher": "MarcelRoozekrans",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/MarcelRoozekrans/CopilotBridge"
  },
  "icon": "media/icon.png",
  "categories": ["Other"],
  "keywords": ["copilot", "claude", "skills", "bridge"],
  "badges": []
}
```

### Required Files

- `README.md` — marketplace listing (required by vsce)
- `CHANGELOG.md` — version history
- `LICENSE` — MIT license file
- `media/icon.png` — 128x128 extension icon

### Tooling

- Add `@vscode/vsce` as a devDependency
- Scripts: `npm run package` (creates `.vsix`), `npm run publish` (publishes to marketplace)
- Update `.vscodeignore` to exclude test files, docs, source maps

### Publish Flow

```
npm run package   → creates copilot-skill-bridge-0.1.0.vsix
vsce login MarcelRoozekrans   → authenticates with PAT
npm run publish   → publishes to marketplace
```

---

## 2. GitHub Repo & Remote

### Steps

```bash
gh repo create MarcelRoozekrans/CopilotBridge --public --source=. --push
git branch -M main
git push -u origin main
```

### Branch Strategy

- Rename `master` → `main`
- Push full commit history

---

## 3. Integration Tests

### Approach: `@vscode/test-electron`

Launches a real VS Code instance (Electron) and runs Mocha tests inside the extension host. Tests have full access to the `vscode` API — no mocking needed.

### Test Structure

```
src/test/
├── unit/                    (existing unit tests, moved here)
│   ├── converter.test.ts
│   ├── parser.test.ts
│   └── ...
├── integration/
│   ├── extension.test.ts    (activation, command registration)
│   ├── treeView.test.ts     (TreeView rendering, item status)
│   ├── importFlow.test.ts   (end-to-end import workflow)
│   ├── updateWatcher.test.ts(file watcher events, remote polling)
│   └── auth.test.ts         (auth session handling)
├── runIntegrationTests.ts   (test launcher — downloads VS Code, runs tests)
└── index.ts                 (Mocha test suite loader for integration)
```

### Test Scenarios (Full Coverage)

**Extension lifecycle:**
- Extension activates on startup
- All commands are registered
- TreeView provider is registered and renders

**Core workflows:**
- Import a skill → files written to `.github/instructions/` and `.github/prompts/`
- Remove a skill → files deleted, manifest updated
- Rebuild registry → `copilot-instructions.md` regenerated

**UI interactions:**
- TreeView shows correct status icons (synced, available, update, conflict)
- Context menu commands execute correctly
- Notifications appear on update detection

**File watcher events:**
- Local SKILL.md change triggers update detection
- Remote check detects version changes

**Authentication:**
- Authenticated requests include bearer token
- Unauthenticated fallback works when no session exists

### Scripts

```json
{
  "test:unit": "mocha",
  "test:integration": "node out/test/runIntegrationTests.js",
  "test": "npm run test:unit && npm run test:integration"
}
```

### Dependencies

```json
{
  "@vscode/test-electron": "^2.4.0"
}
```

---

## 4. GitHub Authentication

### API: `vscode.authentication`

Use VS Code's built-in GitHub authentication provider. When the user has the GitHub extension installed (ships with VS Code), this gives us OAuth tokens without any custom auth flow.

### Design

```typescript
async function getGitHubToken(): Promise<string | undefined> {
  const session = await vscode.authentication.getSession('github', ['repo'], {
    createIfNone: false,
  });
  return session?.accessToken;
}
```

### Integration Points

**remoteReader.ts** — attach token to all GitHub API requests:

```typescript
const headers: Record<string, string> = {
  'User-Agent': 'copilot-skill-bridge',
  Accept: 'application/vnd.github.v3+json',
};
const token = await getGitHubToken();
if (token) {
  headers['Authorization'] = `Bearer ${token}`;
}
```

**New command:** `Copilot Skill Bridge: Sign in to GitHub`
- Calls `getSession` with `createIfNone: true` to prompt login
- Shows status message on success/failure

**Rate limit awareness:**
- Unauthenticated: 60 requests/hour
- Authenticated: 5,000 requests/hour
- Read `X-RateLimit-Remaining` header and warn when low

### TreeView Status

Show auth status in the TreeView root node description:
- `(authenticated)` when a GitHub session exists
- `(unauthenticated — sign in for private repos)` when not

### No Stored Credentials

Tokens are managed entirely by VS Code's secret storage. The extension never stores, logs, or exposes tokens.

---

## Dependencies Summary

| Package | Purpose |
|---------|---------|
| `@vscode/vsce` (dev) | Package and publish extension |
| `@vscode/test-electron` (dev) | Integration test runner |

No new runtime dependencies. Authentication uses the built-in VS Code API.
