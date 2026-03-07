import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { BridgeManifest, SkillImportState } from './types';

const MANIFEST_FILENAME = '.copilot-skill-bridge.json';

export function createEmptyManifest(): BridgeManifest {
    return {
        skills: {},
        mcpServers: {},
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
    const existing = manifest.skills[skillName];
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
                embedded: existing?.embedded ?? false,
            },
        },
    };
}

export function setSkillEmbedded(manifest: BridgeManifest, skillName: string, embedded: boolean): BridgeManifest {
    const state = manifest.skills[skillName];
    if (!state) { return manifest; }
    return {
        ...manifest,
        skills: {
            ...manifest.skills,
            [skillName]: { ...state, embedded },
        },
    };
}

export function isSkillEmbedded(manifest: BridgeManifest, skillName: string): boolean {
    return manifest.skills[skillName]?.embedded ?? false;
}

export function removeSkillRecord(manifest: BridgeManifest, skillName: string): BridgeManifest {
    const { [skillName]: _, ...remainingSkills } = manifest.skills;
    return { ...manifest, skills: remainingSkills };
}

export function isMcpServerImported(manifest: BridgeManifest, serverName: string): boolean {
    return serverName in (manifest.mcpServers ?? {});
}

export function recordMcpImport(
    manifest: BridgeManifest,
    serverName: string,
    source: string,
): BridgeManifest {
    return {
        ...manifest,
        mcpServers: {
            ...(manifest.mcpServers ?? {}),
            [serverName]: {
                source,
                importedAt: new Date().toISOString(),
            },
        },
    };
}

export function removeMcpRecord(manifest: BridgeManifest, serverName: string): BridgeManifest {
    const { [serverName]: _, ...remaining } = (manifest.mcpServers ?? {});
    return { ...manifest, mcpServers: remaining };
}

export function recordMarketplace(manifest: BridgeManifest, repo: string, lastChecked: string): BridgeManifest {
    const existing = manifest.marketplaces.findIndex(m => m.repo === repo);
    const entry = { repo, lastChecked };
    const marketplaces = [...manifest.marketplaces];
    if (existing >= 0) {
        marketplaces[existing] = entry;
    } else {
        marketplaces.push(entry);
    }
    return { ...manifest, marketplaces };
}

export function updateMarketplaceLastChecked(manifest: BridgeManifest, repo: string, lastChecked: string): BridgeManifest {
    return recordMarketplace(manifest, repo, lastChecked);
}
