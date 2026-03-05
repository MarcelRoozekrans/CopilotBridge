import * as assert from 'assert';
import * as vscode from 'vscode';
import { buildRegistryTable, mergeRegistryIntoInstructions, updateCopilotInstructions, writeInstructionsFile, writePromptFile, removeSkillFiles } from '../../fileWriter';

describe('buildRegistryTable', () => {
    it('should produce a 2-column table for embedded skills', () => {
        const entries = [
            { name: 'brainstorming', file: '.github/instructions/brainstorming.instructions.md' },
            { name: 'tdd', file: '.github/instructions/tdd.instructions.md' },
        ];
        const table = buildRegistryTable(entries);
        assert.ok(table.includes('| Skill | File |'));
        assert.ok(table.includes('Always-active skills'));
        assert.ok(table.includes('| brainstorming |'));
        assert.ok(table.includes('| tdd |'));
    });

    it('should include Context Over Tools section', () => {
        const table = buildRegistryTable([]);
        assert.ok(table.includes('## Context Over Tools'));
        assert.ok(table.includes('Prefer using conversation context'));
    });

    it('should return empty section when no entries and no prompts', () => {
        const table = buildRegistryTable([]);
        assert.ok(table.includes('No skills imported'));
    });

    it('should show prompts pointer when hasPromptSkills is true', () => {
        const table = buildRegistryTable([], true);
        assert.ok(table.includes('.github/prompts/'));
        assert.ok(!table.includes('No skills imported'));
        assert.ok(!table.includes('Always-active'));
    });

    it('should show both prompts pointer and embedded table', () => {
        const entries = [
            { name: 'tdd', file: '.github/instructions/tdd.instructions.md' },
        ];
        const table = buildRegistryTable(entries, true);
        assert.ok(table.includes('.github/prompts/'));
        assert.ok(table.includes('Always-active skills'));
        assert.ok(table.includes('| tdd |'));
    });
});

describe('mergeRegistryIntoInstructions', () => {
    it('should append registry to empty instructions file', () => {
        const result = mergeRegistryIntoInstructions('', '## Skills\n| table |');
        assert.ok(result.includes('## Skills'));
    });

    it('should replace existing registry section', () => {
        const existing = `# Project Instructions

Some rules here.

<!-- copilot-skill-bridge:start -->
## Old Skills
old table
<!-- copilot-skill-bridge:end -->

More content.`;

        const newRegistry = '## New Skills\nnew table';
        const result = mergeRegistryIntoInstructions(existing, newRegistry);
        assert.ok(result.includes('## New Skills'));
        assert.ok(!result.includes('## Old Skills'));
        assert.ok(result.includes('Some rules here.'));
        assert.ok(result.includes('More content.'));
    });
});

describe('updateCopilotInstructions', () => {
    const workspaceUri = vscode.Uri.file('/tmp/test');
    let writtenContent: string | undefined;
    const origWriteFile = vscode.workspace.fs.writeFile;
    const origReadFile = vscode.workspace.fs.readFile;

    beforeEach(() => {
        writtenContent = undefined;
        (vscode.workspace.fs as any).writeFile = async (_uri: any, buf: Uint8Array) => {
            writtenContent = Buffer.from(buf).toString('utf-8');
        };
        (vscode.workspace.fs as any).readFile = async () => { throw new Error('not found'); };
    });

    afterEach(() => {
        (vscode.workspace.fs as any).writeFile = origWriteFile;
        (vscode.workspace.fs as any).readFile = origReadFile;
    });

    it('should write a registry table for new entries', async () => {
        const entries = [
            { name: 'brainstorming', file: '.github/instructions/brainstorming.instructions.md' },
        ];
        await updateCopilotInstructions(workspaceUri, entries);
        assert.ok(writtenContent);
        assert.ok(writtenContent!.includes('brainstorming'));
        assert.ok(writtenContent!.includes('copilot-skill-bridge:start'));
    });

    it('should write empty section when no entries', async () => {
        await updateCopilotInstructions(workspaceUri, []);
        assert.ok(writtenContent);
        assert.ok(writtenContent!.includes('No skills imported'));
    });

    it('should merge into existing content', async () => {
        (vscode.workspace.fs as any).readFile = async () => Buffer.from('# My Instructions\n\nSome existing content.');
        const entries = [
            { name: 'tdd', file: '.github/instructions/tdd.instructions.md' },
        ];
        await updateCopilotInstructions(workspaceUri, entries);
        assert.ok(writtenContent);
        assert.ok(writtenContent!.includes('Some existing content'));
        assert.ok(writtenContent!.includes('tdd'));
    });
});

describe('writeInstructionsFile', () => {
    const workspaceUri = vscode.Uri.file('/tmp/test');
    let writtenPath: string | undefined;
    let writtenContent: string | undefined;
    const origWriteFile = vscode.workspace.fs.writeFile;

    beforeEach(() => {
        writtenPath = undefined;
        writtenContent = undefined;
        (vscode.workspace.fs as any).writeFile = async (uri: any, buf: Uint8Array) => {
            writtenPath = uri.fsPath;
            writtenContent = Buffer.from(buf).toString('utf-8');
        };
    });

    afterEach(() => {
        (vscode.workspace.fs as any).writeFile = origWriteFile;
    });

    it('should write to .github/instructions/<name>.instructions.md', async () => {
        await writeInstructionsFile(workspaceUri, 'brainstorming', 'test content');
        assert.ok(writtenPath!.includes('instructions'));
        assert.ok(writtenPath!.includes('brainstorming.instructions.md'));
        assert.strictEqual(writtenContent, 'test content');
    });
});

describe('writePromptFile', () => {
    const workspaceUri = vscode.Uri.file('/tmp/test');
    let writtenPath: string | undefined;
    const origWriteFile = vscode.workspace.fs.writeFile;

    beforeEach(() => {
        writtenPath = undefined;
        (vscode.workspace.fs as any).writeFile = async (uri: any, _buf: Uint8Array) => {
            writtenPath = uri.fsPath;
        };
    });

    afterEach(() => {
        (vscode.workspace.fs as any).writeFile = origWriteFile;
    });

    it('should write to .github/prompts/<name>.prompt.md', async () => {
        await writePromptFile(workspaceUri, 'brainstorming', 'test content');
        assert.ok(writtenPath!.includes('prompts'));
        assert.ok(writtenPath!.includes('brainstorming.prompt.md'));
    });
});

describe('removeSkillFiles', () => {
    const workspaceUri = vscode.Uri.file('/tmp/test');
    let deletedPaths: string[];
    const origDelete = vscode.workspace.fs.delete;

    beforeEach(() => {
        deletedPaths = [];
        (vscode.workspace.fs as any).delete = async (uri: any) => {
            deletedPaths.push(uri.fsPath);
        };
    });

    afterEach(() => {
        (vscode.workspace.fs as any).delete = origDelete;
    });

    it('should delete both instructions and prompt files', async () => {
        await removeSkillFiles(workspaceUri, 'brainstorming');
        assert.strictEqual(deletedPaths.length, 2);
        assert.ok(deletedPaths.some(p => p.includes('brainstorming.instructions.md')));
        assert.ok(deletedPaths.some(p => p.includes('brainstorming.prompt.md')));
    });
});
