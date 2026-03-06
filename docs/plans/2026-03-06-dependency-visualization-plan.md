# Dependency Visualization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show dependency repos nested under their parent marketplace with a virtual "Dependencies" folder, and display skill-to-skill cross-references as description text.

**Architecture:** Add a `DependencyGraph` type that records BFS edges during discovery. The tree provider uses this graph to nest dependency repos under parent marketplaces via a new `dependencyGroup` node type. Skill descriptions are enriched with cross-skill references from the existing `extractSkillDependencies` function.

**Tech Stack:** TypeScript, VS Code TreeView API, Mocha unit tests.

---

### Task 1: Add DependencyGraph type to types.ts

**Files:**
- Modify: `src/types.ts:149-152` (DiscoveryResult interface)

**Step 1: Write the failing test**

In `src/test/unit/importService.test.ts`, add a test inside the existing `BFS dependency resolution` describe block that verifies `dependencyGraph` is returned:

```typescript
it('should return dependencyGraph with edges from BFS', async () => {
    const responses: Record<string, RemoteDiscoveryResult> = {
        'user/marketplace-a': {
            plugins: [makePlugin('plugin-a', 'user/marketplace-a', ['skill-a'])],
            dependencies: ['user/marketplace-b'],
        },
        'user/marketplace-b': {
            plugins: [makePlugin('plugin-b', 'user/marketplace-b', ['skill-b'])],
            dependencies: ['user/marketplace-c'],
        },
        'user/marketplace-c': {
            plugins: [makePlugin('plugin-c', 'user/marketplace-c', ['skill-c'])],
            dependencies: [],
        },
    };

    const fetcher = async (repo: string): Promise<RemoteDiscoveryResult> => {
        const result = responses[repo];
        if (!result) { throw new Error(`Unknown repo: ${repo}`); }
        return result;
    };

    const { dependencyGraph } = await service.discoverAllPlugins(
        '/nonexistent/cache', ['user/marketplace-a'], undefined, fetcher,
    );

    assert.ok(dependencyGraph, 'Should return dependencyGraph');
    assert.deepStrictEqual(dependencyGraph.roots, ['user/marketplace-a']);
    assert.deepStrictEqual(dependencyGraph.edges.get('user/marketplace-a'), ['user/marketplace-b']);
    assert.deepStrictEqual(dependencyGraph.edges.get('user/marketplace-b'), ['user/marketplace-c']);
    assert.strictEqual(dependencyGraph.edges.has('user/marketplace-c'), false);
});
```

Also add a test for redirect-based dependencies:

```typescript
it('should record redirect repos as edges in dependencyGraph', async () => {
    const responses: Record<string, RemoteDiscoveryResult> = {
        'user/extensions': {
            plugins: [makePlugin('my-plugin', 'user/extensions', ['my-skill'])],
            dependencies: ['obra/superpowers-marketplace'],
        },
        'obra/superpowers-marketplace': {
            plugins: [],
            dependencies: ['obra/superpowers', 'obra/superpowers-chrome'],
        },
        'obra/superpowers': {
            plugins: [makePlugin('superpowers', 'obra/superpowers', ['tdd'])],
            dependencies: [],
        },
        'obra/superpowers-chrome': {
            plugins: [makePlugin('chrome', 'obra/superpowers-chrome', ['browsing'])],
            dependencies: [],
        },
    };

    const fetcher = async (repo: string): Promise<RemoteDiscoveryResult> => {
        const result = responses[repo];
        if (!result) { throw new Error(`Unknown repo: ${repo}`); }
        return result;
    };

    const { dependencyGraph } = await service.discoverAllPlugins(
        '/nonexistent/cache', ['user/extensions'], undefined, fetcher,
    );

    assert.deepStrictEqual(dependencyGraph.roots, ['user/extensions']);
    assert.deepStrictEqual(dependencyGraph.edges.get('user/extensions'), ['obra/superpowers-marketplace']);
    const spDeps = dependencyGraph.edges.get('obra/superpowers-marketplace')!.sort();
    assert.deepStrictEqual(spDeps, ['obra/superpowers', 'obra/superpowers-chrome']);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit 2>&1 | tail -20`
Expected: FAIL — `dependencyGraph` property does not exist on `DiscoveryResult`

**Step 3: Add DependencyGraph interface and update DiscoveryResult**

In `src/types.ts`, add before the `DiscoveryResult` interface:

```typescript
export interface DependencyGraph {
    edges: Map<string, string[]>;
    roots: string[];
}
```

Update `DiscoveryResult`:

```typescript
export interface DiscoveryResult {
    plugins: PluginInfo[];
    errors: DiscoveryError[];
    dependencyGraph: DependencyGraph;
}
```

**Step 4: Record edges in BFS loop**

In `src/importService.ts:discoverAllPlugins`, add after `const queue = [...remoteRepos];` (line 56):

```typescript
const depGraph: DependencyGraph = { edges: new Map(), roots: [...remoteRepos] };
```

Import `DependencyGraph` at the top of the file.

Inside the BFS loop, replace the dependency-adding block (lines 80-84):

```typescript
for (const dep of result.value.dependencies) {
    // Record edge regardless of visited status
    const parentEdges = depGraph.edges.get(batch[i]) ?? [];
    parentEdges.push(dep);
    depGraph.edges.set(batch[i], parentEdges);

    if (!visited.has(dep.toLowerCase())) {
        queue.push(dep);
    }
}
```

Update the return statement (line 105-108):

```typescript
return {
    plugins: this.mergePluginLists(localPlugins, remotePlugins),
    errors,
    dependencyGraph: depGraph,
};
```

**Step 5: Run test to verify it passes**

Run: `npm run test:unit 2>&1 | tail -20`
Expected: PASS

**Step 6: Commit**

```bash
git add src/types.ts src/importService.ts src/test/unit/importService.test.ts
git commit -m "feat: add DependencyGraph type and record BFS edges"
```

---

### Task 2: Pass dependency graph to tree provider

**Files:**
- Modify: `src/treeView.ts:87-109` (SkillBridgeTreeProvider class)
- Modify: `src/extension.ts:211-232` (refreshAll function)

**Step 1: Write the failing test**

In `src/test/unit/treeView.test.ts`, add a new describe block:

```typescript
describe('TreeView dependency grouping', () => {
    let provider: SkillBridgeTreeProvider;

    beforeEach(() => {
        provider = new SkillBridgeTreeProvider();
    });

    it('should accept depGraph in setData', () => {
        const depGraph = { edges: new Map([['user/marketplace', ['user/dep-repo']]]), roots: ['user/marketplace'] };
        provider.setData([makePlugin({ marketplace: 'user/marketplace' })], makeManifest(), depGraph);
        const roots = provider.getChildren(undefined);
        assert.ok(roots.length > 0);
    });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit 2>&1 | tail -20`
Expected: FAIL — `setData` does not accept 3 arguments

**Step 3: Update setData signature and store depGraph**

In `src/treeView.ts`, add import for `DependencyGraph`:

```typescript
import { SkillInfo, PluginInfo, SkillStatus, McpServerInfo, DependencyGraph } from './types';
```

Add field to `SkillBridgeTreeProvider`:

```typescript
private depGraph: DependencyGraph = { edges: new Map(), roots: [] };
```

Update `setData`:

```typescript
setData(plugins: PluginInfo[], manifest: BridgeManifest, depGraph?: DependencyGraph) {
    this.plugins = plugins;
    this.manifest = manifest;
    if (depGraph) { this.depGraph = depGraph; }
    this._loading = false;
    this._onDidChangeTreeData.fire();
}
```

**Step 4: Update extension.ts to pass depGraph**

In `src/extension.ts`, update `refreshAll` to destructure and pass `dependencyGraph`:

```typescript
const { plugins, errors, dependencyGraph } = await importService.discoverAllPlugins(
    cachePath,
    remoteRepos,
    (partialPlugins) => {
        importService.setPlugins(partialPlugins);
        treeProvider.setData(partialPlugins, manifest);
    },
);

importService.setPlugins(plugins);
treeProvider.setData(plugins, manifest, dependencyGraph);
```

Also store the graph on importService for use in other places. Add to `ImportService`:

```typescript
private _depGraph: DependencyGraph = { edges: new Map(), roots: [] };

getDepGraph(): DependencyGraph { return this._depGraph; }
```

Set it at the end of `discoverAllPlugins` before returning:

```typescript
this._depGraph = depGraph;
```

**Step 5: Run test to verify it passes**

Run: `npm run test:unit 2>&1 | tail -20`
Expected: PASS

**Step 6: Commit**

```bash
git add src/treeView.ts src/extension.ts src/importService.ts src/test/unit/treeView.test.ts
git commit -m "feat: pass dependency graph from discovery to tree provider"
```

---

### Task 3: Restructure getRootNodes to hide dependency repos

**Files:**
- Modify: `src/treeView.ts:154-177` (getRootNodes method)
- Test: `src/test/unit/treeView.test.ts`

**Step 1: Write the failing test**

```typescript
it('should hide dependency repos from root level', () => {
    const depGraph = {
        edges: new Map([['user/marketplace', ['user/dep-repo']]]),
        roots: ['user/marketplace'],
    };
    const plugins = [
        makePlugin({ name: 'main-plugin', marketplace: 'user/marketplace', source: 'remote' }),
        makePlugin({ name: 'dep-plugin', marketplace: 'user/dep-repo', source: 'remote' }),
    ];
    provider.setData(plugins, makeManifest(), depGraph);

    const roots = provider.getChildren(undefined);
    // Only the root marketplace should appear, not the dependency
    assert.strictEqual(roots.length, 1);
    assert.strictEqual(roots[0].label, 'main-plugin');
});

it('should show dependency repos from root when no depGraph provided', () => {
    const plugins = [
        makePlugin({ name: 'main-plugin', marketplace: 'user/marketplace', source: 'remote' }),
        makePlugin({ name: 'dep-plugin', marketplace: 'user/dep-repo', source: 'remote' }),
    ];
    provider.setData(plugins, makeManifest());

    const roots = provider.getChildren(undefined);
    // Without depGraph, both show at root (backward compat)
    assert.strictEqual(roots.length, 2);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit 2>&1 | tail -20`
Expected: FAIL — both repos appear at root

**Step 3: Update getRootNodes to filter dependency repos**

In `src/treeView.ts`, update `getRootNodes`:

```typescript
private getRootNodes(): SkillTreeItem[] {
    // Collect all repos that are dependencies (not roots)
    const depRepos = new Set<string>();
    for (const deps of this.depGraph.edges.values()) {
        for (const dep of deps) {
            depRepos.add(dep.toLowerCase());
        }
    }

    const byMarketplace = new Map<string, PluginInfo[]>();
    for (const p of this.plugins) {
        const key = p.marketplace;
        const list = byMarketplace.get(key) ?? [];
        list.push(p);
        byMarketplace.set(key, list);
    }

    const items: SkillTreeItem[] = [];
    for (const [repo, plugins] of byMarketplace) {
        // Skip repos that are dependencies (they'll appear nested)
        if (depRepos.has(repo.toLowerCase())) { continue; }

        if (plugins.length === 1) {
            items.push(new SkillTreeItem(plugins[0].name, 'plugin', plugins[0]));
        } else {
            const node = new SkillTreeItem(repo, 'marketplace', undefined, undefined, undefined, undefined, undefined, repo);
            node.description = `${plugins.length} plugins`;
            const allLocal = plugins.every(p => p.source === 'local');
            if (allLocal) { node.contextValue = 'marketplace-local'; }
            items.push(node);
        }
    }

    return items;
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit 2>&1 | tail -20`
Expected: PASS

**Step 5: Commit**

```bash
git add src/treeView.ts src/test/unit/treeView.test.ts
git commit -m "feat: hide dependency repos from root level in TreeView"
```

---

### Task 4: Add dependencyGroup node type and render dependencies

**Files:**
- Modify: `src/treeView.ts` (TreeItemType, SkillTreeItem constructor, getChildren)
- Test: `src/test/unit/treeView.test.ts`

**Step 1: Write the failing tests**

```typescript
it('should show Dependencies folder under marketplace with deps', () => {
    const depGraph = {
        edges: new Map([['user/marketplace', ['user/dep-a', 'user/dep-b']]]),
        roots: ['user/marketplace'],
    };
    const plugins = [
        makePlugin({ name: 'main-a', marketplace: 'user/marketplace', source: 'remote' }),
        makePlugin({ name: 'main-b', marketplace: 'user/marketplace', source: 'remote' }),
        makePlugin({ name: 'dep-plugin-a', marketplace: 'user/dep-a', source: 'remote' }),
        makePlugin({ name: 'dep-plugin-b', marketplace: 'user/dep-b', source: 'remote' }),
    ];
    provider.setData(plugins, makeManifest(), depGraph);

    const roots = provider.getChildren(undefined);
    assert.strictEqual(roots.length, 1); // marketplace group
    assert.strictEqual(roots[0].itemType, 'marketplace');

    const children = provider.getChildren(roots[0]);
    // Should have 2 plugin nodes + 1 Dependencies group
    const depGroup = children.find(c => c.itemType === 'dependencyGroup');
    assert.ok(depGroup, 'Should have a Dependencies group');
    assert.strictEqual(depGroup!.label, 'Dependencies');
    assert.strictEqual(depGroup!.description, '2 repos');
});

it('should show dependency repos inside Dependencies folder', () => {
    const depGraph = {
        edges: new Map([['user/marketplace', ['user/dep-repo']]]),
        roots: ['user/marketplace'],
    };
    const plugins = [
        makePlugin({ name: 'main-plugin', marketplace: 'user/marketplace', source: 'remote' }),
        makePlugin({ name: 'dep-plugin', marketplace: 'user/dep-repo', source: 'remote' }),
    ];
    provider.setData(plugins, makeManifest(), depGraph);

    const roots = provider.getChildren(undefined);
    // Single plugin at root, but it has dependencies
    // For single-plugin marketplace that is a root, it should still show as plugin
    // but deps should be accessible
    const root = roots[0];

    const children = provider.getChildren(root);
    const depGroup = children.find(c => c.itemType === 'dependencyGroup');
    assert.ok(depGroup, 'Should have Dependencies group');

    const depChildren = provider.getChildren(depGroup!);
    assert.strictEqual(depChildren.length, 1);
    assert.strictEqual(depChildren[0].label, 'dep-plugin');
});

it('should not show Dependencies folder when marketplace has no deps', () => {
    const depGraph = {
        edges: new Map(),
        roots: ['user/marketplace'],
    };
    const plugins = [
        makePlugin({ name: 'main-a', marketplace: 'user/marketplace', source: 'remote' }),
        makePlugin({ name: 'main-b', marketplace: 'user/marketplace', source: 'remote' }),
    ];
    provider.setData(plugins, makeManifest(), depGraph);

    const roots = provider.getChildren(undefined);
    const children = provider.getChildren(roots[0]);
    const depGroup = children.find(c => c.itemType === 'dependencyGroup');
    assert.strictEqual(depGroup, undefined);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit 2>&1 | tail -20`
Expected: FAIL — `dependencyGroup` type not recognized

**Step 3: Add dependencyGroup to TreeItemType and SkillTreeItem**

In `src/treeView.ts`:

Update `TreeItemType`:
```typescript
export type TreeItemType = 'marketplace' | 'plugin' | 'skill' | 'mcpGroup' | 'mcpServer' | 'dependencyGroup';
```

Add constructor handling for `dependencyGroup` (after the `mcpGroup` block):
```typescript
} else if (itemType === 'dependencyGroup') {
    this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    this.iconPath = new vscode.ThemeIcon('library');
    this.contextValue = 'dependencyGroup';
    this.tooltip = 'Repositories fetched as dependencies of this marketplace';
}
```

**Step 4: Update getChildren for marketplace nodes**

In `getChildren`, update the marketplace handler (lines 131-136):

```typescript
if (element.itemType === 'marketplace') {
    const repo = element.marketplaceRepo!;
    const children: SkillTreeItem[] = this.plugins
        .filter(p => p.marketplace === repo)
        .map(p => new SkillTreeItem(p.name, 'plugin', p));

    // Add Dependencies folder if this marketplace has deps
    const deps = this.depGraph.edges.get(repo) ?? [];
    if (deps.length > 0) {
        const depNode = new SkillTreeItem('Dependencies', 'dependencyGroup', undefined, undefined, undefined, undefined, undefined, repo);
        depNode.description = `${deps.length} repo${deps.length > 1 ? 's' : ''}`;
        children.push(depNode);
    }

    return children;
}
```

Add a new handler for `dependencyGroup`:

```typescript
if (element.itemType === 'dependencyGroup') {
    const parentRepo = element.marketplaceRepo!;
    const depRepos = this.depGraph.edges.get(parentRepo) ?? [];
    return this.getDependencyChildren(depRepos);
}
```

Add the helper method:

```typescript
private getDependencyChildren(depRepos: string[]): SkillTreeItem[] {
    const items: SkillTreeItem[] = [];
    for (const depRepo of depRepos) {
        const depPlugins = this.plugins.filter(p => p.marketplace.toLowerCase() === depRepo.toLowerCase());
        if (depPlugins.length === 1) {
            items.push(new SkillTreeItem(depPlugins[0].name, 'plugin', depPlugins[0]));
        } else if (depPlugins.length > 1) {
            const node = new SkillTreeItem(depRepo, 'marketplace', undefined, undefined, undefined, undefined, undefined, depRepo);
            node.description = `${depPlugins.length} plugins`;
            items.push(node);
        }
        // If depPlugins.length === 0, the dep repo had no plugins (e.g., all redirects) — skip it
    }
    return items;
}
```

**Step 5: Handle single-plugin root marketplaces with dependencies**

Currently, single-plugin marketplaces render directly as a plugin node at root. But if they have deps, we need them to be a marketplace node so deps can be children. Update `getRootNodes`:

```typescript
// In the loop over byMarketplace entries:
const hasDeps = (this.depGraph.edges.get(repo)?.length ?? 0) > 0;

if (plugins.length === 1 && !hasDeps) {
    items.push(new SkillTreeItem(plugins[0].name, 'plugin', plugins[0]));
} else {
    const node = new SkillTreeItem(repo, 'marketplace', undefined, undefined, undefined, undefined, undefined, repo);
    node.description = plugins.length === 1 ? '1 plugin' : `${plugins.length} plugins`;
    const allLocal = plugins.every(p => p.source === 'local');
    if (allLocal) { node.contextValue = 'marketplace-local'; }
    items.push(node);
}
```

**Step 6: Run test to verify it passes**

Run: `npm run test:unit 2>&1 | tail -20`
Expected: PASS

**Step 7: Commit**

```bash
git add src/treeView.ts src/test/unit/treeView.test.ts
git commit -m "feat: add dependencyGroup node type and nested dependency rendering"
```

---

### Task 5: Show skill-to-skill dependencies in description

**Files:**
- Modify: `src/treeView.ts:179-222` (getPluginChildren method)
- Test: `src/test/unit/treeView.test.ts`

**Step 1: Write the failing test**

```typescript
describe('TreeView skill dependency descriptions', () => {
    let provider: SkillBridgeTreeProvider;

    beforeEach(() => {
        provider = new SkillBridgeTreeProvider();
    });

    it('should show cross-skill references in description', () => {
        const plugin = makePlugin({
            name: 'superpowers',
            marketplace: 'test',
            skills: [
                {
                    name: 'tdd',
                    description: 'TDD skill',
                    content: 'Use superpowers:systematic-debugging when tests fail.\nAlso see superpowers:brainstorming.',
                    pluginName: 'superpowers',
                    pluginVersion: '1.0.0',
                    marketplace: 'test',
                    source: 'local',
                },
                {
                    name: 'systematic-debugging',
                    description: 'Debug skill',
                    content: 'Step-by-step debugging.',
                    pluginName: 'superpowers',
                    pluginVersion: '1.0.0',
                    marketplace: 'test',
                    source: 'local',
                },
            ],
        });
        provider.setData([plugin], makeManifest());

        const pluginItem = provider.getChildren(undefined)[0];
        const children = provider.getChildren(pluginItem);
        const tdd = children.find(c => c.label === 'tdd')!;
        assert.ok(tdd.description?.toString().includes('systematic-debugging'),
            `Expected description "${tdd.description}" to include "systematic-debugging"`);
    });

    it('should not add dependency text for skills without cross-references', () => {
        const plugin = makePlugin({
            name: 'superpowers',
            marketplace: 'test',
            skills: [{
                name: 'simple-skill',
                description: 'Simple',
                content: 'No cross-references here.',
                pluginName: 'superpowers',
                pluginVersion: '1.0.0',
                marketplace: 'test',
                source: 'local',
            }],
        });
        provider.setData([plugin], makeManifest());

        const pluginItem = provider.getChildren(undefined)[0];
        const children = provider.getChildren(pluginItem);
        const skill = children.find(c => c.label === 'simple-skill')!;
        assert.strictEqual(skill.description, 'available');
    });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit 2>&1 | tail -20`
Expected: FAIL — description is just "available", doesn't include dependency names

**Step 3: Update getPluginChildren to include skill deps in description**

In `src/treeView.ts`, in `getPluginChildren`, after setting `status` and creating the `SkillTreeItem`, add dependency description logic. Replace the block that creates `item` and sets embedded state (around lines 205-211):

```typescript
const item = new SkillTreeItem(skill.name, 'skill', plugin, skill, status);

// Enrich description with skill dependencies
const filteredDeps = compat.skillDependencies.filter(d => d !== skill.name);
if (filteredDeps.length > 0 && status !== 'incompatible') {
    const statusText = item.description ?? status;
    item.description = `${statusText} -> ${filteredDeps.join(', ')}`;
}

if (status === 'synced' && this.manifest.skills[skill.name]?.embedded) {
    item.iconPath = new vscode.ThemeIcon('pin', new vscode.ThemeColor('testing.iconPassed'));
    item.description = 'always active';
    item.contextValue = 'skill-synced-embedded';
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit 2>&1 | tail -20`
Expected: PASS

**Step 5: Commit**

```bash
git add src/treeView.ts src/test/unit/treeView.test.ts
git commit -m "feat: show skill-to-skill cross-references in description"
```

---

### Task 6: Handle progressive loading with depGraph

**Files:**
- Modify: `src/importService.ts` (onProgress callback)
- Modify: `src/extension.ts` (refreshAll)

**Step 1: Write the failing test**

```typescript
it('should include partial depGraph in onProgress callbacks', async () => {
    const responses: Record<string, RemoteDiscoveryResult> = {
        'user/marketplace-a': {
            plugins: [makePlugin('plugin-a', 'user/marketplace-a')],
            dependencies: ['user/marketplace-b'],
        },
        'user/marketplace-b': {
            plugins: [makePlugin('plugin-b', 'user/marketplace-b')],
            dependencies: [],
        },
    };

    const fetcher = async (repo: string): Promise<RemoteDiscoveryResult> => {
        const result = responses[repo];
        if (!result) { throw new Error(`Unknown repo: ${repo}`); }
        return result;
    };

    const progressGraphs: DependencyGraph[] = [];
    await service.discoverAllPlugins(
        '/nonexistent/cache',
        ['user/marketplace-a'],
        (_plugins, depGraph) => { if (depGraph) { progressGraphs.push(depGraph); } },
        fetcher,
    );

    assert.ok(progressGraphs.length >= 1, 'Should have received progress with depGraph');
    // First callback should have at least the first batch's edges
    assert.deepStrictEqual(progressGraphs[0].roots, ['user/marketplace-a']);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit 2>&1 | tail -20`
Expected: FAIL — `onProgress` callback doesn't receive depGraph

**Step 3: Update onProgress signature and callers**

In `src/importService.ts`, update the `onProgress` parameter type:

```typescript
onProgress?: (plugins: PluginInfo[], depGraph?: DependencyGraph) => void,
```

Update both `onProgress` calls in `discoverAllPlugins`:

```typescript
// Line ~52: initial local plugins
if (onProgress && localPlugins.length > 0) {
    onProgress(this.mergePluginLists(localPlugins, []), depGraph);
}

// Line ~100: after each BFS batch
if (onProgress) {
    onProgress(this.mergePluginLists(localPlugins, remotePlugins), depGraph);
}
```

In `src/extension.ts`, update the `refreshAll` callback:

```typescript
const { plugins, errors, dependencyGraph } = await importService.discoverAllPlugins(
    cachePath,
    remoteRepos,
    (partialPlugins, partialGraph) => {
        importService.setPlugins(partialPlugins);
        treeProvider.setData(partialPlugins, manifest, partialGraph);
    },
);
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit 2>&1 | tail -20`
Expected: PASS

**Step 5: Run full test suite**

Run: `npm test 2>&1 | tail -30`
Expected: All unit + integration tests pass

**Step 6: Commit**

```bash
git add src/importService.ts src/extension.ts src/test/unit/importService.test.ts
git commit -m "feat: pass dependency graph through progressive loading callbacks"
```

---

### Task 7: Update existing tests for backward compatibility

**Files:**
- Modify: `src/test/unit/treeView.test.ts`
- Modify: `src/test/unit/importService.test.ts`

**Step 1: Verify existing tests still pass**

Run: `npm run test:unit 2>&1 | tail -30`

If any existing tests fail because of the `getRootNodes` changes (single-plugin repos with deps getting promoted to marketplace nodes, or `description` text changing), fix them:

- Tests that check `roots.length` may need updating if dep repos are now hidden
- Tests that check `description === 'available'` may need updating for skills with cross-refs
- The existing BFS tests should still pass since they don't check `dependencyGraph`

**Step 2: Fix any failing tests**

Update assertions as needed. The most likely breakage is the `description` field on skill items that happen to have `superpowers:` in their content.

**Step 3: Run full test suite**

Run: `npm test 2>&1 | tail -30`
Expected: ALL tests pass (unit + integration)

**Step 4: Commit**

```bash
git add src/test/unit/treeView.test.ts src/test/unit/importService.test.ts
git commit -m "test: fix existing tests for dependency visualization changes"
```

---

### Task 8: Final verification and cleanup

**Step 1: Compile**

Run: `npm run compile 2>&1`
Expected: No errors

**Step 2: Run full test suite**

Run: `npm test 2>&1`
Expected: All tests pass

**Step 3: Verify tree structure visually (manual)**

Check the Copilot Skill Bridge sidebar with a marketplace that has dependencies (e.g., `obra/superpowers-marketplace`). Verify:
- Only user-added repos at root
- "Dependencies" folder visible under marketplace
- Dependency repos nested inside
- Skill descriptions show cross-references

**Step 4: Commit any final adjustments**

```bash
git add -A
git commit -m "chore: final cleanup for dependency visualization"
```
