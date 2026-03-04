import * as vscode from 'vscode';

interface RegistryEntry {
    name: string;
    file: string;
}

const REGISTRY_START = '<!-- copilot-skill-bridge:start -->';
const REGISTRY_END = '<!-- copilot-skill-bridge:end -->';

export function buildRegistryTable(entries: RegistryEntry[]): string {
    if (entries.length === 0) {
        return `## Available Skills\n\nNo skills imported yet.\n`;
    }

    const header = '## Available Skills\n\nWhen working on tasks, consult these skill files for guidance:\n\n';
    const tableHeader = '| Skill | File |\n|-------|------|\n';
    const rows = entries
        .map(e => `| ${e.name} | ${e.file} |`)
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

    const section = buildRegistryTable(entries);
    const merged = mergeRegistryIntoInstructions(existing, section);
    await vscode.workspace.fs.writeFile(instructionsUri, Buffer.from(merged, 'utf-8'));
}

export async function removeSkillFiles(workspaceUri: vscode.Uri, skillName: string): Promise<void> {
    const instructionsFile = vscode.Uri.joinPath(workspaceUri, '.github', 'instructions', `${skillName}.instructions.md`);
    const promptFile = vscode.Uri.joinPath(workspaceUri, '.github', 'prompts', `${skillName}.prompt.md`);

    try { await vscode.workspace.fs.delete(instructionsFile); } catch { /* may not exist */ }
    try { await vscode.workspace.fs.delete(promptFile); } catch { /* may not exist */ }
}
