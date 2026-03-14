import * as vscode from 'vscode';
import { VsCodeMcpConfig } from './mcpConverter';
import { getLogger } from './logger';

interface McpJsonFile {
    servers: Record<string, any>;
    inputs?: any[];
}

export function mergeMcpConfigs(
    existing: McpJsonFile,
    incoming: VsCodeMcpConfig,
    manifestManagedNames: string[],
): McpJsonFile {
    const merged: McpJsonFile = {
        servers: { ...existing.servers },
    };

    for (const [name, entry] of Object.entries(incoming.servers)) {
        const existsInFile = name in existing.servers;
        const isBridgeManaged = manifestManagedNames.includes(name);

        if (!existsInFile) {
            merged.servers[name] = entry;
        } else if (isBridgeManaged) {
            merged.servers[name] = entry;
        }
        // else: user-added — skip
    }

    // Merge inputs
    const existingInputs: any[] = existing.inputs ?? [];
    const existingIds = new Set(existingInputs.map((i: any) => i.id));
    const newInputs = incoming.inputs.filter(i => !existingIds.has(i.id));
    if (existingInputs.length > 0 || newInputs.length > 0) {
        merged.inputs = [...existingInputs, ...newInputs];
    }

    return merged;
}

export function removeServerFromConfig(config: McpJsonFile, serverName: string): McpJsonFile {
    const { [serverName]: _, ...remainingServers } = config.servers;
    const remainingInputs = (config.inputs ?? []).filter(
        (i: any) => !i.id.startsWith(`${serverName}-`)
    );
    return {
        servers: remainingServers,
        ...(remainingInputs.length > 0 ? { inputs: remainingInputs } : {}),
    };
}

export async function readMcpJson(workspaceUri: vscode.Uri): Promise<McpJsonFile> {
    const fileUri = vscode.Uri.joinPath(workspaceUri, '.vscode', 'mcp.json');
    try {
        const raw = await vscode.workspace.fs.readFile(fileUri);
        return JSON.parse(Buffer.from(raw).toString('utf-8'));
    } catch (err) {
        getLogger().warn('mcpWriter.readMcpJson: config read failure', err);
        return { servers: {} };
    }
}

export async function writeMcpJson(workspaceUri: vscode.Uri, config: McpJsonFile): Promise<void> {
    const dir = vscode.Uri.joinPath(workspaceUri, '.vscode');
    await vscode.workspace.fs.createDirectory(dir);
    const fileUri = vscode.Uri.joinPath(dir, 'mcp.json');
    const content = JSON.stringify(config, null, 2);
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));
}
