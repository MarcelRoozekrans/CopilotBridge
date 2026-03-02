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
