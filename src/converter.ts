interface RegistryEntry {
    name: string;
    trigger: string;
    file: string;
}

const CONVERSION_RULES: Array<{ pattern: RegExp; replacement: string }> = [
    // Tool references
    { pattern: /\bTodoWrite\b\s*tool/gi, replacement: 'task checklist' },
    { pattern: /\bTodoWrite\b/g, replacement: 'task checklist' },
    { pattern: /\buse the Agent tool\b/gi, replacement: 'break into subtasks and handle sequentially' },
    { pattern: /\bAgent tool\b/gi, replacement: 'subtask delegation' },
    { pattern: /\bsubagents?\b/gi, replacement: 'subtasks' },
    { pattern: /\bSkill tool\b/gi, replacement: 'instructions file' },
    { pattern: /\bRead tool\b/gi, replacement: 'file reading' },
    { pattern: /\bEdit tool\b/gi, replacement: 'file editing' },
    { pattern: /\bWrite tool\b/gi, replacement: 'file writing' },
    { pattern: /\bGrep\b(?!\s*\()/g, replacement: 'code search' },
    { pattern: /\bGlob\b(?!\s*\()/g, replacement: 'file search' },
    { pattern: /\bAskUserQuestion\b/g, replacement: 'ask the user' },

    // MCP memory tool references → natural language
    { pattern: /\bsearch_memory\b/g, replacement: 'search your memory' },
    { pattern: /\bsave_memory\b/g, replacement: 'save to memory' },
    { pattern: /\bupdate_memory\b/g, replacement: 'update the memory' },
    { pattern: /\bdelete_memory\b/g, replacement: 'delete the memory' },

    // Plan mode
    { pattern: /\bEnterPlanMode\b/g, replacement: 'present your plan to the user for approval' },
    { pattern: /\bExitPlanMode\b/g, replacement: 'finalize the plan and proceed' },

    // Claude-specific paths and files
    { pattern: /\bCLAUDE\.md\b/g, replacement: '.github/copilot-instructions.md' },
    { pattern: /~\/\.claude\/[\w/.-]*/g, replacement: '[local config]' },

    // Jargon
    { pattern: /\byour human partner\b/gi, replacement: 'the user' },
    { pattern: /\bClaude Code-specific\b/gi, replacement: 'AI assistant-specific' },
    { pattern: /\bClaude Code\b/gi, replacement: 'the AI assistant' },
];

export type OutputFormat = 'instructions' | 'prompts';

export function convertSkillContent(content: string, outputFormats?: OutputFormat[]): string {
    let result = content;
    for (const rule of CONVERSION_RULES) {
        result = result.replace(rule.pattern, rule.replacement);
    }

    // Cross-reference rewriting: adapt to output format
    const usePrompts = outputFormats && !outputFormats.includes('instructions') && outputFormats.includes('prompts');
    if (usePrompts) {
        result = result.replace(/superpowers:([\w-]+)/g, '.github/prompts/$1.prompt.md');
    } else {
        result = result.replace(/superpowers:([\w-]+)/g, '.github/instructions/$1.instructions.md');
    }

    return result;
}

function toTitleCase(name: string): string {
    return name
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

export function generateInstructionsFile(name: string, description: string, convertedBody: string): string {
    const titleName = toTitleCase(name);
    return `---
name: '${titleName}'
description: '${description.replace(/'/g, "''")}'
applyTo: '**/*'
---

${convertedBody}
`;
}

export function generatePromptFile(name: string, description: string): string {
    return `---
name: ${name}
description: ${description}
agent: agent
---

Follow the instructions in .github/instructions/${name}.instructions.md
`;
}

export function generateFullPromptFile(name: string, description: string, convertedBody: string): string {
    return `---
name: ${name}
description: '${description.replace(/'/g, "''")}'
agent: agent
---

${convertedBody}
`;
}

export function generateRegistryEntry(name: string, description: string): RegistryEntry {
    return {
        name,
        trigger: description,
        file: `.github/instructions/${name}.instructions.md`,
    };
}
