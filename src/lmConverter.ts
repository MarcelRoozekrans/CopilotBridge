import * as vscode from 'vscode';

export const SYSTEM_PROMPT = `You are rewriting AI assistant instructions. The original was written for Claude Code.
Rewrite it for GitHub Copilot in VS Code.

Rules:
1. Rephrase sentences that reference Claude-specific workflows, tools, or capabilities
2. Preserve all markdown formatting, code blocks, and structural elements exactly
3. Don't remove content - rephrase it
4. Don't change file paths or cross-references (already converted)
5. Return only the rewritten content, no explanation`;

interface LmMessage {
    role: 'system' | 'user';
    content: string;
}

export function buildLmPrompt(content: string): LmMessage[] {
    return [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
    ];
}

export function extractLmResponse(response: string): string {
    const trimmed = response.trim();
    if (!trimmed) { return ''; }

    // Strip markdown code fences if LM wraps the output
    const fenceMatch = trimmed.match(/^```(?:markdown)?\n([\s\S]*?)\n```$/);
    if (fenceMatch) {
        return fenceMatch[1].trim();
    }

    return trimmed;
}

export async function convertWithLM(content: string): Promise<string> {
    let models: vscode.LanguageModelChat[];
    try {
        models = await vscode.lm.selectChatModels({ family: 'gpt-4o' });
        if (models.length === 0) {
            models = await vscode.lm.selectChatModels({});
        }
    } catch {
        return content; // silent fallback
    }

    if (models.length === 0) {
        return content; // no models available
    }

    const model = models[0];
    const messages = [
        vscode.LanguageModelChatMessage.User(
            `${SYSTEM_PROMPT}\n\n---\n\n${content}`
        ),
    ];

    try {
        const response = await model.sendRequest(messages, {});
        let result = '';
        for await (const chunk of response.text) {
            result += chunk;
        }
        const extracted = extractLmResponse(result);
        return extracted || content; // fall back if extraction is empty
    } catch {
        return content; // silent fallback on error
    }
}
