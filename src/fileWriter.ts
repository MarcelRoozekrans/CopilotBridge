import * as vscode from 'vscode';

interface RegistryEntry {
    name: string;
    file: string;
}

const REGISTRY_START = '<!-- copilot-skill-bridge:start -->';
const REGISTRY_END = '<!-- copilot-skill-bridge:end -->';

export function buildRegistryTable(entries: RegistryEntry[], hasPromptSkills?: boolean): string {
    const parts: string[] = [];
    parts.push('## Context Over Tools\n');
    parts.push('Prefer using conversation context, file contents already shared, and information from previous messages over invoking tools to re-read or re-fetch the same data. Only use tools when the needed information is not already available in context.\n');
    parts.push('## Available Skills\n');

    if (entries.length === 0 && !hasPromptSkills) {
        parts.push('No skills imported yet.\n');
        return parts.join('\n');
    }

    if (hasPromptSkills) {
        parts.push('On-demand skills are available as slash commands in `.github/prompts/`.\n');
    }

    if (entries.length > 0) {
        parts.push('Always-active skills:\n');
        const tableHeader = '| Skill | File |\n|-------|------|\n';
        const rows = entries
            .map(e => `| ${e.name} | ${e.file} |`)
            .join('\n');
        parts.push(tableHeader + rows + '\n');
    }

    return parts.join('\n');
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
    entries: RegistryEntry[],
    hasPromptSkills?: boolean
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

    const section = buildRegistryTable(entries, hasPromptSkills);
    const merged = mergeRegistryIntoInstructions(existing, section);
    await vscode.workspace.fs.writeFile(instructionsUri, Buffer.from(merged, 'utf-8'));
}

export async function writeCompanionFiles(
    workspaceUri: vscode.Uri,
    skillName: string,
    companionFiles: Array<{ name: string; content: string }>,
    convertContent: (content: string) => string,
    targetDir?: 'instructions' | 'prompts'
): Promise<void> {
    const subdir = targetDir ?? 'instructions';
    const dir = vscode.Uri.joinPath(workspaceUri, '.github', subdir);
    await vscode.workspace.fs.createDirectory(dir);
    for (const file of companionFiles) {
        const converted = convertContent(file.content);
        const fileUri = vscode.Uri.joinPath(dir, `${skillName}-${file.name}`);
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(converted, 'utf-8'));
    }
}

export async function removeSkillFiles(workspaceUri: vscode.Uri, skillName: string): Promise<void> {
    const instructionsDir = vscode.Uri.joinPath(workspaceUri, '.github', 'instructions');
    const instructionsFile = vscode.Uri.joinPath(instructionsDir, `${skillName}.instructions.md`);
    const promptFile = vscode.Uri.joinPath(workspaceUri, '.github', 'prompts', `${skillName}.prompt.md`);

    try { await vscode.workspace.fs.delete(instructionsFile); } catch { /* may not exist */ }
    try { await vscode.workspace.fs.delete(promptFile); } catch { /* may not exist */ }

    // Remove companion files (prefixed with skillName-) from both directories
    const promptsDir = vscode.Uri.joinPath(workspaceUri, '.github', 'prompts');
    for (const dir of [instructionsDir, promptsDir]) {
        try {
            const entries = await vscode.workspace.fs.readDirectory(dir);
            for (const [fileName] of entries) {
                if (fileName.startsWith(`${skillName}-`) && fileName.endsWith('.md')) {
                    const fileUri = vscode.Uri.joinPath(dir, fileName);
                    try { await vscode.workspace.fs.delete(fileUri); } catch { /* skip */ }
                }
            }
        } catch { /* dir may not exist */ }
    }
}
