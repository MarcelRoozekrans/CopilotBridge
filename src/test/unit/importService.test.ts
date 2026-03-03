import * as assert from 'assert';
import { ImportService } from '../../importService';
import { SkillInfo, McpServerInfo, PluginInfo } from '../../types';

function makeSkill(overrides: Partial<SkillInfo> = {}): SkillInfo {
    return {
        name: 'test-skill',
        description: 'A test skill',
        content: '---\nname: test-skill\ndescription: A test skill\n---\n\nUse the TodoWrite tool to track tasks. Check CLAUDE.md for details.',
        pluginName: 'test-plugin',
        pluginVersion: '1.0.0',
        marketplace: 'test-marketplace',
        source: 'local',
        ...overrides,
    };
}

describe('ImportService.convertSkill', () => {
    const workspaceUri = { fsPath: '/tmp/test-workspace', path: '/tmp/test-workspace' } as any;
    let service: ImportService;

    before(() => {
        service = new ImportService(workspaceUri);
    });

    it('should return a ConversionResult with all required fields', () => {
        const result = service.convertSkill(makeSkill());
        assert.ok(result.convertedBody);
        assert.ok(result.instructionsContent);
        assert.ok(result.promptContent);
        assert.ok(result.registryEntry);
        assert.ok(result.originalContent);
    });

    it('should store convertedBody without frontmatter wrapping', () => {
        const result = service.convertSkill(makeSkill());
        assert.ok(!result.convertedBody.includes('applyTo:'), 'convertedBody should not contain instructions frontmatter');
        assert.ok(!result.convertedBody.startsWith('---'), 'convertedBody should not start with frontmatter delimiter');
        assert.ok(result.convertedBody.includes('checklist'), 'convertedBody should contain converted content');
    });

    it('should apply conversion rules to the instructions content', () => {
        const result = service.convertSkill(makeSkill());
        assert.ok(!result.instructionsContent.includes('TodoWrite'));
        assert.ok(result.instructionsContent.includes('checklist'));
        assert.ok(!result.instructionsContent.includes('CLAUDE.md'));
        assert.ok(result.instructionsContent.includes('copilot-instructions.md'));
    });

    it('should generate a pointer-style prompt file', () => {
        const result = service.convertSkill(makeSkill());
        assert.ok(result.promptContent.includes('.github/instructions/test-skill.instructions.md'));
        assert.ok(!result.promptContent.includes('TodoWrite'));
        assert.ok(!result.promptContent.includes('CLAUDE.md'));
    });

    it('should preserve original content unchanged', () => {
        const skill = makeSkill();
        const result = service.convertSkill(skill);
        assert.strictEqual(result.originalContent, skill.content);
    });

    it('should generate correct registry entry', () => {
        const result = service.convertSkill(makeSkill({ name: 'brainstorming', description: 'Creative helper' }));
        assert.strictEqual(result.registryEntry.name, 'brainstorming');
        assert.strictEqual(result.registryEntry.trigger, 'Creative helper');
        assert.ok(result.registryEntry.file.includes('brainstorming.instructions.md'));
    });

    it('should strip frontmatter from the instructions body', () => {
        const result = service.convertSkill(makeSkill());
        // The instructions file should have its own frontmatter, not the original one
        const parts = result.instructionsContent.split('---');
        // parts[0] is empty, parts[1] is frontmatter, parts[2] is body
        assert.ok(!parts[2].includes('name: test-skill'));
    });

    it('should handle content without frontmatter', () => {
        const skill = makeSkill({ content: 'Plain body with no frontmatter. Use the Agent tool.' });
        const result = service.convertSkill(skill);
        assert.ok(!result.instructionsContent.includes('Agent tool'));
        assert.ok(result.instructionsContent.includes('break into subtasks'));
    });
});

describe('ImportService.writeSkillFiles prompt format', () => {
    const workspaceUri = { fsPath: '/tmp/test-workspace', path: '/tmp/test-workspace' } as any;
    let service: ImportService;
    const vscode = require('vscode');
    let writtenFiles: Array<{ path: string; content: string }>;
    let origWriteFile: any;
    let origShowInfo: any;

    before(() => {
        origWriteFile = vscode.workspace.fs.writeFile;
        origShowInfo = vscode.window.showInformationMessage;
    });

    beforeEach(() => {
        service = new ImportService(workspaceUri);
        writtenFiles = [];
        vscode.workspace.fs.writeFile = async (uri: any, content: Buffer) => {
            writtenFiles.push({ path: uri.fsPath, content: content.toString('utf-8') });
        };
    });

    afterEach(() => {
        vscode.workspace.fs.writeFile = origWriteFile;
        vscode.window.showInformationMessage = origShowInfo;
    });

    it('should write full-content prompt file when format is prompts', async () => {
        const skill = makeSkill();
        vscode.window.showInformationMessage = async () => 'Import All';
        await service.importAllSkills([skill], ['prompts'], false);

        const promptFile = writtenFiles.find(f => f.path.includes('.prompt.md'));
        assert.ok(promptFile, 'Should have written a prompt file');
        assert.ok(promptFile!.content.includes('agent: agent'), 'Prompt should have agent frontmatter');
        assert.ok(promptFile!.content.includes('checklist'), 'Prompt should contain converted body');
        assert.ok(!promptFile!.content.includes('applyTo:'), 'Prompt should not contain instructions frontmatter (no double frontmatter)');

        // Verify only one frontmatter block (exactly 2 '---' delimiters)
        const delimiterCount = (promptFile!.content.match(/^---$/gm) || []).length;
        assert.strictEqual(delimiterCount, 2, `Should have exactly one frontmatter block (2 delimiters), got ${delimiterCount}`);
    });

    it('should write pointer prompt when format includes instructions', async () => {
        const skill = makeSkill();
        vscode.window.showInformationMessage = async () => 'Import All';
        await service.importAllSkills([skill], ['instructions', 'prompts'], false);

        const promptFile = writtenFiles.find(f => f.path.includes('.prompt.md'));
        assert.ok(promptFile, 'Should have written a prompt file');
        assert.ok(promptFile!.content.includes('Follow the instructions in'), 'Should be a pointer when instructions also generated');
    });
});

describe('ImportService MCP methods', () => {
    const workspaceUri = { fsPath: '/tmp/test-workspace', path: '/tmp/test-workspace' } as any;
    let service: ImportService;

    before(() => {
        service = new ImportService(workspaceUri);
    });

    it('should have importMcpServer method', () => {
        assert.strictEqual(typeof service.importMcpServer, 'function');
    });

    it('should have importAllMcpServers method', () => {
        assert.strictEqual(typeof service.importAllMcpServers, 'function');
    });

    it('should have removeMcpServer method', () => {
        assert.strictEqual(typeof service.removeMcpServer, 'function');
    });
});

describe('ImportService.mergePlugins', () => {
    const workspaceUri = { fsPath: '/tmp/test-workspace', path: '/tmp/test-workspace' } as any;
    let service: ImportService;

    before(() => {
        service = new ImportService(workspaceUri);
    });

    function makeMcpServer(name: string): McpServerInfo {
        return { name, config: { command: 'npx', args: ['-y', name] }, pluginName: 'test', pluginVersion: '1.0.0', marketplace: 'test' };
    }

    it('should preserve mcpServers from remote when plugin exists only remotely', () => {
        const remotePlugin: PluginInfo = {
            name: 'longterm-memory',
            description: 'Memory plugin',
            version: '1.0.0',
            skills: [],
            mcpServers: [makeMcpServer('longterm-memory')],
            marketplace: 'MarcelRoozekrans/LongtermMemory-MCP',
            source: 'remote',
        };

        // mergePlugins is called internally by discoverAllPlugins;
        // test the merge logic directly
        const merged = service.mergePluginLists([], [remotePlugin]);
        assert.strictEqual(merged.length, 1);
        assert.strictEqual(merged[0].mcpServers?.length, 1);
        assert.strictEqual(merged[0].mcpServers![0].name, 'longterm-memory');
    });

    it('should merge mcpServers from remote into local plugin', () => {
        const localPlugin: PluginInfo = {
            name: 'longterm-memory',
            description: 'Memory plugin',
            version: '1.0.0',
            skills: [makeSkill({ name: 'long-term-memory', pluginName: 'longterm-memory' })],
            marketplace: 'local-cache',
            source: 'local',
        };
        const remotePlugin: PluginInfo = {
            name: 'longterm-memory',
            description: 'Memory plugin',
            version: '1.0.0',
            skills: [makeSkill({ name: 'long-term-memory', pluginName: 'longterm-memory', source: 'remote' })],
            mcpServers: [makeMcpServer('longterm-memory')],
            marketplace: 'MarcelRoozekrans/LongtermMemory-MCP',
            source: 'remote',
        };

        const merged = service.mergePluginLists([localPlugin], [remotePlugin]);
        assert.strictEqual(merged.length, 1);
        assert.strictEqual(merged[0].source, 'both');
        assert.ok(merged[0].mcpServers, 'Merged plugin should have mcpServers');
        assert.strictEqual(merged[0].mcpServers!.length, 1);
        assert.strictEqual(merged[0].mcpServers![0].name, 'longterm-memory');
    });

    it('should keep local mcpServers when remote has none', () => {
        const localPlugin: PluginInfo = {
            name: 'test-plugin',
            description: 'test',
            version: '1.0.0',
            skills: [],
            mcpServers: [makeMcpServer('local-srv')],
            marketplace: 'local',
            source: 'local',
        };
        const remotePlugin: PluginInfo = {
            name: 'test-plugin',
            description: 'test',
            version: '1.0.0',
            skills: [],
            marketplace: 'remote',
            source: 'remote',
        };

        const merged = service.mergePluginLists([localPlugin], [remotePlugin]);
        assert.strictEqual(merged[0].mcpServers?.length, 1);
        assert.strictEqual(merged[0].mcpServers![0].name, 'local-srv');
    });

    it('should merge mcpServers from both local and remote without duplicates', () => {
        const localPlugin: PluginInfo = {
            name: 'test-plugin',
            description: 'test',
            version: '1.0.0',
            skills: [],
            mcpServers: [makeMcpServer('shared-srv')],
            marketplace: 'local',
            source: 'local',
        };
        const remotePlugin: PluginInfo = {
            name: 'test-plugin',
            description: 'test',
            version: '1.0.0',
            skills: [],
            mcpServers: [makeMcpServer('shared-srv'), makeMcpServer('remote-only-srv')],
            marketplace: 'remote',
            source: 'remote',
        };

        const merged = service.mergePluginLists([localPlugin], [remotePlugin]);
        assert.strictEqual(merged[0].mcpServers?.length, 2);
        const names = merged[0].mcpServers!.map(s => s.name);
        assert.ok(names.includes('shared-srv'));
        assert.ok(names.includes('remote-only-srv'));
    });
});

describe('ImportService.importSkill preview cleanup', () => {
    const workspaceUri = { fsPath: '/tmp/test-workspace', path: '/tmp/test-workspace' } as any;
    let service: ImportService;
    const vscode = require('vscode');
    let executeCommandCalls: string[];
    let origExecuteCommand: any;
    let origShowInfoMessage: any;

    before(() => {
        origExecuteCommand = vscode.commands.executeCommand;
        origShowInfoMessage = vscode.window.showInformationMessage;
    });

    beforeEach(() => {
        service = new ImportService(workspaceUri);
        executeCommandCalls = [];
        vscode.commands.executeCommand = async (cmd: string) => {
            executeCommandCalls.push(cmd);
        };
    });

    afterEach(() => {
        vscode.commands.executeCommand = origExecuteCommand;
        vscode.window.showInformationMessage = origShowInfoMessage;
    });

    it('should close diff editor when user accepts', async () => {
        vscode.window.showInformationMessage = async () => 'Accept';
        await service.importSkill(makeSkill(), ['instructions', 'prompts'], false);
        assert.ok(executeCommandCalls.includes('vscode.diff'), 'should open diff');
        assert.ok(executeCommandCalls.includes('workbench.action.closeActiveEditor'), 'should close diff');
    });

    it('should close diff editor when user cancels', async () => {
        vscode.window.showInformationMessage = async () => 'Cancel';
        await service.importSkill(makeSkill(), ['instructions', 'prompts'], false);
        assert.ok(executeCommandCalls.includes('workbench.action.closeActiveEditor'), 'should close diff on cancel');
    });

    it('should close diff editor when user dismisses dialog', async () => {
        vscode.window.showInformationMessage = async () => undefined;
        await service.importSkill(makeSkill(), ['instructions', 'prompts'], false);
        assert.ok(executeCommandCalls.includes('workbench.action.closeActiveEditor'), 'should close diff on dismiss');
    });
});

describe('ImportService.importAllSkills', () => {
    const workspaceUri = { fsPath: '/tmp/test-workspace', path: '/tmp/test-workspace' } as any;
    let service: ImportService;
    const vscode = require('vscode');
    let origShowInfoMessage: any;
    let origShowWarningMessage: any;
    let origWithProgress: any;

    before(() => {
        origShowInfoMessage = vscode.window.showInformationMessage;
        origShowWarningMessage = vscode.window.showWarningMessage;
        origWithProgress = vscode.window.withProgress;
    });

    beforeEach(() => {
        service = new ImportService(workspaceUri);
    });

    afterEach(() => {
        vscode.window.showInformationMessage = origShowInfoMessage;
        vscode.window.showWarningMessage = origShowWarningMessage;
        vscode.window.withProgress = origWithProgress;
    });

    it('should return empty result for empty skills array', async () => {
        const result = await service.importAllSkills([], ['instructions'], false);
        assert.strictEqual(result.imported.length, 0);
        assert.strictEqual(result.failed.length, 0);
    });

    it('should not proceed when user cancels confirmation', async () => {
        vscode.window.showInformationMessage = async () => 'Cancel';
        const result = await service.importAllSkills([makeSkill()], ['instructions'], false);
        assert.strictEqual(result.imported.length, 0);
    });

    it('should not proceed when user dismisses confirmation', async () => {
        vscode.window.showInformationMessage = async () => undefined;
        const result = await service.importAllSkills([makeSkill()], ['instructions'], false);
        assert.strictEqual(result.imported.length, 0);
    });

    it('should import all skills when user confirms', async () => {
        let callCount = 0;
        vscode.window.showInformationMessage = async () => {
            callCount++;
            if (callCount === 1) { return 'Import All'; }
            return undefined;
        };

        const skills = [makeSkill({ name: 'skill-a' }), makeSkill({ name: 'skill-b' })];
        const result = await service.importAllSkills(skills, ['instructions'], false);

        assert.strictEqual(result.imported.length, 2);
        assert.ok(result.imported.includes('skill-a'));
        assert.ok(result.imported.includes('skill-b'));
        assert.strictEqual(result.failed.length, 0);
    });

    it('should report progress for each skill', async () => {
        vscode.window.showInformationMessage = async () => 'Import All';

        const progressMessages: string[] = [];
        vscode.window.withProgress = async (_opts: any, task: any) => {
            const progress = {
                report: (value: { message?: string }) => {
                    if (value.message) { progressMessages.push(value.message); }
                },
            };
            const token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) };
            return task(progress, token);
        };

        const skills = [makeSkill({ name: 'skill-x' }), makeSkill({ name: 'skill-y' })];
        await service.importAllSkills(skills, ['instructions'], false);

        assert.ok(progressMessages.some(m => m.includes('skill-x')));
        assert.ok(progressMessages.some(m => m.includes('skill-y')));
    });

    it('should respect cancellation token', async () => {
        vscode.window.showInformationMessage = async () => 'Import All';
        vscode.window.withProgress = async (_opts: any, task: any) => {
            const progress = { report: () => {} };
            const token = { isCancellationRequested: true, onCancellationRequested: () => ({ dispose: () => {} }) };
            return task(progress, token);
        };

        const result = await service.importAllSkills([makeSkill({ name: 'should-skip' })], ['instructions'], false);
        assert.strictEqual(result.imported.length, 0);
    });

    it('should show truncated summary for many skills', async () => {
        let confirmationMsg = '';
        vscode.window.showInformationMessage = async (msg: string) => {
            confirmationMsg = msg;
            return 'Cancel';
        };

        const skills = Array.from({ length: 10 }, (_, i) => makeSkill({ name: `skill-${i}` }));
        await service.importAllSkills(skills, ['instructions'], false);

        assert.ok(confirmationMsg.includes('10 skill(s)'));
        assert.ok(confirmationMsg.includes('and 7 more'));
    });
});

describe('ImportService compatibility gate', () => {
    const workspaceUri = { fsPath: '/tmp/test-workspace', path: '/tmp/test-workspace' } as any;
    let service: ImportService;
    const vscode = require('vscode');
    let warningMessages: string[];
    let origShowWarning: any;
    let origShowInfo: any;

    before(() => {
        origShowWarning = vscode.window.showWarningMessage;
        origShowInfo = vscode.window.showInformationMessage;
    });

    beforeEach(() => {
        service = new ImportService(workspaceUri);
        warningMessages = [];
        vscode.window.showWarningMessage = async (msg: string) => {
            warningMessages.push(msg);
            return undefined;
        };
    });

    afterEach(() => {
        vscode.window.showWarningMessage = origShowWarning;
        vscode.window.showInformationMessage = origShowInfo;
    });

    it('should block import of incompatible skill with warning', async () => {
        const skill = makeSkill({
            content: 'Dispatch a subtask for each file. Launch parallel agents.',
        });
        vscode.window.showInformationMessage = async () => 'Accept';
        await service.importSkill(skill, ['prompts'], false);
        assert.ok(warningMessages.length > 0, 'Should show warning');
        assert.ok(warningMessages[0].includes('incompatible'), 'Warning should mention incompatible');
    });

    it('should allow import of compatible skill', async () => {
        const skill = makeSkill({
            content: '---\nname: tdd\ndescription: TDD\n---\nWrite tests first.',
        });
        vscode.window.showInformationMessage = async () => 'Accept';
        await service.importSkill(skill, ['prompts'], false);
        assert.strictEqual(warningMessages.length, 0, 'Should not show warning');
    });

    it('should skip incompatible skills in bulk import', async () => {
        const compatible = makeSkill({ name: 'tdd', content: '---\nname: tdd\ndescription: TDD\n---\nWrite tests.' });
        const incompatible = makeSkill({ name: 'parallel', content: 'Launch parallel agents to work.' });

        const infoMessages: string[] = [];
        vscode.window.showInformationMessage = async (msg: string) => {
            infoMessages.push(msg);
            return 'Import All';
        };

        const result = await service.importAllSkills([compatible, incompatible], ['prompts'], false);
        assert.strictEqual(result.imported.length, 1);
        assert.ok(result.imported.includes('tdd'));
        const confirmMsg = infoMessages.find(m => m.includes('incompatible'));
        assert.ok(confirmMsg, 'Should mention incompatible in confirmation: ' + JSON.stringify(infoMessages));
        assert.ok(confirmMsg!.includes('1 incompatible'));
    });

    it('should return empty when all skills incompatible in bulk', async () => {
        const skill = makeSkill({ content: 'Dispatch subtask. Launch parallel agents.' });
        const result = await service.importAllSkills([skill], ['prompts'], false);
        assert.strictEqual(result.imported.length, 0);
    });
});

describe('ImportService.removeAllSkills', () => {
    const workspaceUri = { fsPath: '/tmp/test-workspace', path: '/tmp/test-workspace' } as any;
    let service: ImportService;
    const vscode = require('vscode');
    let origWriteFile: any;
    let origReadFile: any;
    let origDelete: any;
    let origShowInfo: any;
    let origShowWarning: any;
    let origWithProgress: any;
    let deletedPaths: string[];
    let fileStore: Map<string, Buffer>;

    before(() => {
        origWriteFile = vscode.workspace.fs.writeFile;
        origReadFile = vscode.workspace.fs.readFile;
        origDelete = vscode.workspace.fs.delete;
        origShowInfo = vscode.window.showInformationMessage;
        origShowWarning = vscode.window.showWarningMessage;
        origWithProgress = vscode.window.withProgress;
    });

    beforeEach(() => {
        service = new ImportService(workspaceUri);
        deletedPaths = [];
        fileStore = new Map();
        vscode.workspace.fs.writeFile = async (uri: any, buf: Uint8Array) => {
            fileStore.set(uri.fsPath, Buffer.from(buf));
        };
        vscode.workspace.fs.readFile = async (uri: any) => {
            const data = fileStore.get(uri.fsPath);
            if (data) { return data; }
            throw new Error('not found');
        };
        vscode.workspace.fs.delete = async (uri: any) => { deletedPaths.push(uri.fsPath); };
        vscode.window.withProgress = async (_opts: any, task: any) => {
            return task({ report: () => {} }, { isCancellationRequested: false });
        };
    });

    afterEach(() => {
        vscode.workspace.fs.writeFile = origWriteFile;
        vscode.workspace.fs.readFile = origReadFile;
        vscode.workspace.fs.delete = origDelete;
        vscode.window.showInformationMessage = origShowInfo;
        vscode.window.showWarningMessage = origShowWarning;
        vscode.window.withProgress = origWithProgress;
    });

    it('should return empty result when no skills are imported', async () => {
        vscode.window.showInformationMessage = async () => {};
        const skill = makeSkill({ name: 'not-imported' });
        const result = await service.removeAllSkills([skill], false);
        assert.strictEqual(result.imported.length, 0);
        assert.strictEqual(result.failed.length, 0);
    });

    it('should not proceed when user cancels confirmation', async () => {
        // First import a skill so there's something to remove
        vscode.window.showInformationMessage = async () => 'Import All';
        await service.importAllSkills([makeSkill()], ['prompts'], false);

        // Now cancel the remove
        vscode.window.showWarningMessage = async () => 'Cancel';
        const result = await service.removeAllSkills([makeSkill()], false);
        assert.strictEqual(result.imported.length, 0);
    });

    it('should remove imported skills when user confirms', async () => {
        // Import first
        vscode.window.showInformationMessage = async () => 'Import All';
        await service.importAllSkills([makeSkill()], ['prompts'], false);

        // Remove
        vscode.window.showWarningMessage = async () => 'Remove All';
        vscode.window.showInformationMessage = async () => {};
        const result = await service.removeAllSkills([makeSkill()], false);
        assert.strictEqual(result.imported.length, 1);
        assert.ok(result.imported.includes('test-skill'));
        assert.ok(deletedPaths.length > 0, 'Should have deleted files');
    });

    it('should skip non-imported skills', async () => {
        // Import one skill
        vscode.window.showInformationMessage = async () => 'Import All';
        await service.importAllSkills([makeSkill({ name: 'imported' })], ['prompts'], false);

        // Try to remove both imported and non-imported
        vscode.window.showWarningMessage = async () => 'Remove All';
        vscode.window.showInformationMessage = async () => {};
        const skills = [
            makeSkill({ name: 'imported' }),
            makeSkill({ name: 'not-imported' }),
        ];
        const result = await service.removeAllSkills(skills, false);
        assert.strictEqual(result.imported.length, 1);
        assert.ok(result.imported.includes('imported'));
        assert.ok(!result.imported.includes('not-imported'));
    });
});

describe('ImportService.getPluginsByMarketplace', () => {
    const workspaceUri = { fsPath: '/tmp/test-workspace', path: '/tmp/test-workspace' } as any;
    let service: ImportService;

    beforeEach(() => {
        service = new ImportService(workspaceUri);
    });

    it('should return plugins matching the marketplace', () => {
        const plugins: PluginInfo[] = [
            { name: 'a', description: '', version: '1', skills: [], marketplace: 'user/repo', source: 'remote' },
            { name: 'b', description: '', version: '1', skills: [], marketplace: 'user/repo', source: 'remote' },
            { name: 'c', description: '', version: '1', skills: [], marketplace: 'other/repo', source: 'remote' },
        ];
        service.setPlugins(plugins);

        const result = service.getPluginsByMarketplace('user/repo');
        assert.strictEqual(result.length, 2);
        assert.ok(result.every(p => p.marketplace === 'user/repo'));
    });

    it('should return empty array for unknown marketplace', () => {
        service.setPlugins([]);
        const result = service.getPluginsByMarketplace('nonexistent');
        assert.strictEqual(result.length, 0);
    });
});
