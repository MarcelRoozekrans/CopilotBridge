# Dependency Visualization in TreeView

**Date:** 2026-03-06
**Status:** Approved

## Problem

When a marketplace has dependencies (other repos), those dependency repos are fetched via BFS and shown as separate top-level marketplace groups in the sidebar. There is no visual indication of which marketplace pulled in which dependency, making the relationship opaque.

Similarly, skills that reference other skills (e.g., `superpowers:systematic-debugging`) don't show those relationships in the UI.

## Solution: Grouped with virtual "Dependencies" folder

User-added marketplaces appear at root. Each marketplace gets a "Dependencies" child group containing repos it pulled in. Skill-to-skill deps shown as description text.

### Tree structure

```
obra/superpowers-marketplace           <- root (user-added)
  Dependencies (2 repos)               <- virtual folder
    obra/superpowers                    <- dependency marketplace
      superpowers (plugin)
        tdd -> systematic-debugging     <- skill with dep in description
        systematic-debugging
    obra/superpowers-extensions
      ...
  some-direct-plugin                   <- direct plugins of this marketplace
Local Cache                            <- local plugins (unchanged)
```

## Data Model Changes

### New type: DependencyGraph

```typescript
interface DependencyGraph {
    // Maps a repo to the repos it depends on (direct deps only)
    edges: Map<string, string[]>;
    // The repos explicitly added by the user (from settings)
    roots: string[];
}
```

### DiscoveryResult addition

```typescript
interface DiscoveryResult {
    plugins: PluginInfo[];
    errors: DiscoveryError[];
    dependencyGraph: DependencyGraph;  // NEW
}
```

### BFS recording

The BFS in `discoverAllPlugins` already knows which repo queued which dependency. Record the edge as each dependency is added to the queue:

```typescript
const depGraph: DependencyGraph = { edges: new Map(), roots: [...remoteRepos] };

// Inside BFS loop, when adding dep to queue:
const deps = depGraph.edges.get(batch[i]) ?? [];
deps.push(dep);
depGraph.edges.set(batch[i], deps);
```

## TreeView Changes

### New tree item type

Add `dependencyGroup` to `TreeItemType`. Similar to `mcpGroup` -- a virtual collapsible folder with a `$(library)` icon and description like "2 repos".

### getRootNodes() changes

- Only user-added repos (`depGraph.roots`) and local plugins appear at root level
- Dependency repos are filtered out of root
- Single-plugin marketplaces that are roots still show directly (existing behavior)

### getChildren(marketplace) changes

Returns:
1. Direct plugins of that marketplace
2. A "Dependencies" node if `depGraph.edges.get(repo)` has entries

### getChildren(dependencyGroup) -- new handler

Returns marketplace-like nodes for each dependency repo, which then expand normally into plugins and skills.

### Skill description dependencies

For each skill, use the existing `extractSkillDependencies` from `compatAnalyzer.ts` to show cross-skill references in the description:

```typescript
if (compat.skillDependencies.length > 0) {
    item.description = `${statusText} -> ${compat.skillDependencies.join(', ')}`;
}
```

No extra tree nodes -- just richer text on existing skill items.

## Shared Dependencies

If repo X is a dependency of both marketplace A and B, it appears under whichever marketplace's BFS discovered it first. This matches BFS traversal semantics naturally. The `visited` set already prevents re-fetching.

## What Stays the Same

- All context menus and import/remove commands work identically
- Import All on a marketplace node includes its dependency repos' plugins
- The BFS logic itself doesn't change, just records edges
- Progressive loading still works -- dependency nodes appear as BFS resolves them
- Local cache plugins are unaffected

## Files to Modify

1. **src/types.ts** -- Add `DependencyGraph` interface, update `DiscoveryResult`
2. **src/importService.ts** -- Record edges during BFS, return graph in result
3. **src/treeView.ts** -- Add `dependencyGroup` type, restructure `getRootNodes()` and `getChildren()`, add skill dep descriptions
4. **src/extension.ts** -- Pass dependency graph through to tree provider
5. **src/test/unit/importService.test.ts** -- Update BFS tests to verify graph edges
6. **src/test/unit/treeView.test.ts** -- Add tests for dependency grouping and skill dep descriptions
