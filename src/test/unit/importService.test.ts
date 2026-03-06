import * as assert from 'assert';
import { ImportService } from '../../importService';
import { SkillInfo, McpServerInfo, PluginInfo, DependencyGraph } from '../../types';
import { RemoteDiscoveryResult } from '../../remoteReader';

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

    it('should return a ConversionResult with all required fields', async () => {
        const result = await service.convertSkill(makeSkill());
        assert.ok(result.convertedBody);
        assert.ok(result.instructionsContent);
        assert.ok(result.promptContent);
        assert.ok(result.registryEntry);
        assert.ok(result.originalContent);
    });

    it('should store convertedBody without frontmatter wrapping', async () => {
        const result = await service.convertSkill(makeSkill());
        assert.ok(!result.convertedBody.includes('applyTo:'), 'convertedBody should not contain instructions frontmatter');
        assert.ok(!result.convertedBody.startsWith('---'), 'convertedBody should not start with frontmatter delimiter');
        assert.ok(result.convertedBody.includes('checklist'), 'convertedBody should contain converted content');
    });

    it('should apply conversion rules to the instructions content', async () => {
        const result = await service.convertSkill(makeSkill());
        assert.ok(!result.instructionsContent.includes('TodoWrite'));
        assert.ok(result.instructionsContent.includes('checklist'));
        assert.ok(!result.instructionsContent.includes('CLAUDE.md'));
        assert.ok(result.instructionsContent.includes('copilot-instructions.md'));
    });

    it('should generate a pointer-style prompt file', async () => {
        const result = await service.convertSkill(makeSkill());
        assert.ok(result.promptContent.includes('.github/instructions/test-skill.instructions.md'));
        assert.ok(!result.promptContent.includes('TodoWrite'));
        assert.ok(!result.promptContent.includes('CLAUDE.md'));
    });

    it('should preserve original content unchanged', async () => {
        const skill = makeSkill();
        const result = await service.convertSkill(skill);
        assert.strictEqual(result.originalContent, skill.content);
    });

    it('should generate correct registry entry', async () => {
        const result = await service.convertSkill(makeSkill({ name: 'brainstorming', description: 'Creative helper' }));
        assert.strictEqual(result.registryEntry.name, 'brainstorming');
        assert.ok(result.registryEntry.file.includes('brainstorming'));
    });

    it('should strip frontmatter from the instructions body', async () => {
        const result = await service.convertSkill(makeSkill());
        // The instructions file should have its own frontmatter, not the original one
        const parts = result.instructionsContent.split('---');
        // parts[0] is empty, parts[1] is frontmatter, parts[2] is body
        assert.ok(!parts[2].includes('name: test-skill'));
    });

    it('should handle content without frontmatter', async () => {
        const skill = makeSkill({ content: 'Plain body with no frontmatter. Use the Agent tool.' });
        const result = await service.convertSkill(skill);
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

describe('ImportService.resolveDependencies', () => {
    const workspaceUri = { fsPath: '/tmp/test-workspace', path: '/tmp/test-workspace' } as any;
    let service: ImportService;
    const vscode = require('vscode');
    let origReadFile: any;
    let fileStore: Map<string, Buffer>;

    before(() => {
        origReadFile = vscode.workspace.fs.readFile;
    });

    beforeEach(() => {
        service = new ImportService(workspaceUri);
        fileStore = new Map();
        vscode.workspace.fs.readFile = async (uri: any) => {
            const data = fileStore.get(uri.fsPath);
            if (data) { return data; }
            throw new Error('not found');
        };
    });

    afterEach(() => {
        vscode.workspace.fs.readFile = origReadFile;
    });

    it('should find missing skill dependencies from superpowers: references', async () => {
        const depSkill = makeSkill({ name: 'brainstorming', content: '# Brainstorming' });
        const mainSkill = makeSkill({
            name: 'tdd',
            content: 'Use superpowers:brainstorming first.',
        });

        const plugins: PluginInfo[] = [
            { name: 'plugin-a', description: '', version: '1', skills: [mainSkill], marketplace: 'test', source: 'remote' },
            { name: 'plugin-b', description: '', version: '1', skills: [depSkill], marketplace: 'dep', source: 'remote' },
        ];
        service.setPlugins(plugins);

        const { missingSkills, missingMcpServers } = await service.resolveDependencies(mainSkill);
        assert.strictEqual(missingSkills.length, 1);
        assert.strictEqual(missingSkills[0].name, 'brainstorming');
        assert.strictEqual(missingMcpServers.length, 0);
    });

    it('should find missing MCP servers from skill plugin', async () => {
        const srv: McpServerInfo = { name: 'playwright', config: { command: 'npx' }, pluginName: 'test', pluginVersion: '1.0.0', marketplace: 'test' };
        const skill = makeSkill({ name: 'regression-test', content: '# Regression test' });
        const plugins: PluginInfo[] = [
            { name: 'test-plugin', description: '', version: '1', skills: [skill], mcpServers: [srv], marketplace: 'test', source: 'remote' },
        ];
        service.setPlugins(plugins);

        const { missingSkills, missingMcpServers } = await service.resolveDependencies(skill);
        assert.strictEqual(missingSkills.length, 0);
        assert.strictEqual(missingMcpServers.length, 1);
        assert.strictEqual(missingMcpServers[0].name, 'playwright');
    });

    it('should not include self-references as dependencies', async () => {
        const skill = makeSkill({
            name: 'tdd',
            content: 'Use superpowers:tdd recursively.',
        });
        service.setPlugins([
            { name: 'p', description: '', version: '1', skills: [skill], marketplace: 'test', source: 'remote' },
        ]);

        const { missingSkills } = await service.resolveDependencies(skill);
        assert.strictEqual(missingSkills.length, 0);
    });

    it('should return empty when all dependencies are already imported', async () => {
        // Simulate an already-imported manifest
        const manifestContent = JSON.stringify({
            skills: { brainstorming: { source: 'test', sourceHash: 'abc', importedHash: 'abc', importedAt: '', locallyModified: false } },
            mcpServers: {},
            marketplaces: [],
            settings: { checkInterval: 86400, autoAcceptUpdates: false },
        });
        fileStore.set('/tmp/test-workspace/.github/.copilot-skill-bridge.json', Buffer.from(manifestContent));

        const skill = makeSkill({
            name: 'tdd',
            content: 'Use superpowers:brainstorming.',
        });
        const depSkill = makeSkill({ name: 'brainstorming', content: '# Brainstorming' });
        service.setPlugins([
            { name: 'p', description: '', version: '1', skills: [skill, depSkill], marketplace: 'test', source: 'remote' },
        ]);

        const { missingSkills } = await service.resolveDependencies(skill);
        assert.strictEqual(missingSkills.length, 0);
    });
});

describe('ImportService.discoverAllPlugins BFS dependency resolution', () => {
    const workspaceUri = { fsPath: '/tmp/test-workspace', path: '/tmp/test-workspace' } as any;
    let service: ImportService;

    beforeEach(() => {
        service = new ImportService(workspaceUri);
    });

    function makePlugin(name: string, marketplace: string, skillNames: string[] = []): PluginInfo {
        return {
            name,
            description: `${name} plugin`,
            version: '1.0.0',
            skills: skillNames.map(s => makeSkill({ name: s, pluginName: name, marketplace })),
            marketplace,
            source: 'remote',
        };
    }

    it('should resolve transitive dependencies via BFS', async () => {
        // Simulates: marketplace-A depends on marketplace-B, which depends on marketplace-C
        const responses: Record<string, RemoteDiscoveryResult> = {
            'user/marketplace-a': {
                plugins: [makePlugin('plugin-a', 'user/marketplace-a', ['skill-a'])],
                dependencies: ['user/marketplace-b'],
            },
            'user/marketplace-b': {
                plugins: [makePlugin('plugin-b', 'user/marketplace-b', ['skill-b'])],
                dependencies: ['user/marketplace-c'],
            },
            'user/marketplace-c': {
                plugins: [makePlugin('plugin-c', 'user/marketplace-c', ['skill-c'])],
                dependencies: [],
            },
        };

        const fetcher = async (repo: string): Promise<RemoteDiscoveryResult> => {
            const result = responses[repo];
            if (!result) { throw new Error(`Unknown repo: ${repo}`); }
            return result;
        };

        const { plugins, errors } = await service.discoverAllPlugins(
            '/nonexistent/cache', ['user/marketplace-a'], undefined, fetcher,
        );

        assert.strictEqual(errors.length, 0);
        const names = plugins.map(p => p.name).sort();
        assert.deepStrictEqual(names, ['plugin-a', 'plugin-b', 'plugin-c']);
    });

    it('should handle source.url redirects (marketplace with no direct plugins)', async () => {
        // Simulates obra/superpowers-marketplace: all plugins are redirects
        const responses: Record<string, RemoteDiscoveryResult> = {
            'user/extensions': {
                plugins: [makePlugin('my-plugin', 'user/extensions', ['my-skill'])],
                dependencies: ['obra/superpowers-marketplace'],
            },
            'obra/superpowers-marketplace': {
                plugins: [], // All entries are source.url redirects
                dependencies: ['obra/superpowers', 'obra/superpowers-chrome'],
            },
            'obra/superpowers': {
                plugins: [makePlugin('superpowers', 'obra/superpowers', ['tdd', 'debugging'])],
                dependencies: [],
            },
            'obra/superpowers-chrome': {
                plugins: [makePlugin('superpowers-chrome', 'obra/superpowers-chrome', ['browsing'])],
                dependencies: [],
            },
        };

        const fetcher = async (repo: string): Promise<RemoteDiscoveryResult> => {
            const result = responses[repo];
            if (!result) { throw new Error(`Unknown repo: ${repo}`); }
            return result;
        };

        const { plugins, errors } = await service.discoverAllPlugins(
            '/nonexistent/cache', ['user/extensions'], undefined, fetcher,
        );

        assert.strictEqual(errors.length, 0);
        const names = plugins.map(p => p.name).sort();
        assert.deepStrictEqual(names, ['my-plugin', 'superpowers', 'superpowers-chrome']);
    });

    it('should detect cycles and not loop infinitely', async () => {
        const responses: Record<string, RemoteDiscoveryResult> = {
            'user/repo-a': {
                plugins: [makePlugin('a', 'user/repo-a', ['skill-a'])],
                dependencies: ['user/repo-b'],
            },
            'user/repo-b': {
                plugins: [makePlugin('b', 'user/repo-b', ['skill-b'])],
                dependencies: ['user/repo-a'], // Cycle!
            },
        };

        const fetcher = async (repo: string): Promise<RemoteDiscoveryResult> => {
            return responses[repo] ?? { plugins: [], dependencies: [] };
        };

        const { plugins } = await service.discoverAllPlugins(
            '/nonexistent/cache', ['user/repo-a'], undefined, fetcher,
        );

        assert.strictEqual(plugins.length, 2);
    });

    it('should deduplicate repos (case-insensitive)', async () => {
        let fetchCount = 0;
        const fetcher = async (repo: string): Promise<RemoteDiscoveryResult> => {
            fetchCount++;
            return {
                plugins: [makePlugin(repo, repo, ['skill-' + fetchCount])],
                dependencies: [],
            };
        };

        const { plugins } = await service.discoverAllPlugins(
            '/nonexistent/cache', ['User/Repo', 'user/repo'], undefined, fetcher,
        );

        assert.strictEqual(fetchCount, 1, 'Should only fetch once for case-insensitive duplicate');
        assert.strictEqual(plugins.length, 1);
    });

    it('should collect errors from failed repos without blocking others', async () => {
        const responses: Record<string, RemoteDiscoveryResult> = {
            'user/good': {
                plugins: [makePlugin('good', 'user/good', ['skill-good'])],
                dependencies: ['user/bad', 'user/also-good'],
            },
            'user/also-good': {
                plugins: [makePlugin('also-good', 'user/also-good', ['skill-also'])],
                dependencies: [],
            },
        };

        const fetcher = async (repo: string): Promise<RemoteDiscoveryResult> => {
            const result = responses[repo];
            if (!result) { throw new Error(`Repo not found: ${repo}`); }
            return result;
        };

        const { plugins, errors } = await service.discoverAllPlugins(
            '/nonexistent/cache', ['user/good'], undefined, fetcher,
        );

        assert.strictEqual(plugins.length, 2);
        assert.strictEqual(errors.length, 1);
        assert.ok(errors[0].message.includes('user/bad'));
    });

    it('should call onProgress after each BFS batch', async () => {
        const responses: Record<string, RemoteDiscoveryResult> = {
            'user/root': {
                plugins: [makePlugin('root', 'user/root', ['root-skill'])],
                dependencies: ['user/dep'],
            },
            'user/dep': {
                plugins: [makePlugin('dep', 'user/dep', ['dep-skill'])],
                dependencies: [],
            },
        };

        const fetcher = async (repo: string): Promise<RemoteDiscoveryResult> => {
            return responses[repo] ?? { plugins: [], dependencies: [] };
        };

        const progressCalls: number[] = [];
        const onProgress = (plugins: PluginInfo[]) => {
            progressCalls.push(plugins.length);
        };

        await service.discoverAllPlugins(
            '/nonexistent/cache', ['user/root'], onProgress, fetcher,
        );

        // Should have at least 2 progress calls: after batch 1 (root) and batch 2 (dep)
        assert.ok(progressCalls.length >= 2, `Expected at least 2 progress calls, got ${progressCalls.length}`);
        assert.strictEqual(progressCalls[0], 1, 'First batch should have 1 plugin');
        assert.strictEqual(progressCalls[1], 2, 'Second batch should have 2 plugins');
    });

    it('should return dependencyGraph with edges from BFS', async () => {
        const responses: Record<string, RemoteDiscoveryResult> = {
            'user/marketplace-a': {
                plugins: [makePlugin('plugin-a', 'user/marketplace-a', ['skill-a'])],
                dependencies: ['user/marketplace-b'],
            },
            'user/marketplace-b': {
                plugins: [makePlugin('plugin-b', 'user/marketplace-b', ['skill-b'])],
                dependencies: ['user/marketplace-c'],
            },
            'user/marketplace-c': {
                plugins: [makePlugin('plugin-c', 'user/marketplace-c', ['skill-c'])],
                dependencies: [],
            },
        };

        const fetcher = async (repo: string): Promise<RemoteDiscoveryResult> => {
            const result = responses[repo];
            if (!result) { throw new Error(`Unknown repo: ${repo}`); }
            return result;
        };

        const { dependencyGraph } = await service.discoverAllPlugins(
            '/nonexistent/cache', ['user/marketplace-a'], undefined, fetcher,
        );

        assert.deepStrictEqual(dependencyGraph.roots, ['user/marketplace-a']);
        assert.deepStrictEqual(dependencyGraph.edges.get('user/marketplace-a'), ['user/marketplace-b']);
        assert.deepStrictEqual(dependencyGraph.edges.get('user/marketplace-b'), ['user/marketplace-c']);
        assert.strictEqual(dependencyGraph.edges.has('user/marketplace-c'), false);
    });

    it('should include partial depGraph in onProgress callbacks', async () => {
        const responses: Record<string, RemoteDiscoveryResult> = {
            'user/marketplace-a': {
                plugins: [makePlugin('plugin-a', 'user/marketplace-a')],
                dependencies: ['user/marketplace-b'],
            },
            'user/marketplace-b': {
                plugins: [makePlugin('plugin-b', 'user/marketplace-b')],
                dependencies: [],
            },
        };

        const fetcher = async (repo: string): Promise<RemoteDiscoveryResult> => {
            const result = responses[repo];
            if (!result) { throw new Error(`Unknown repo: ${repo}`); }
            return result;
        };

        const progressCalls: Array<{ pluginCount: number; hasGraph: boolean; roots: string[] }> = [];
        await service.discoverAllPlugins(
            '/nonexistent/cache',
            ['user/marketplace-a'],
            (plugins, depGraph) => {
                progressCalls.push({
                    pluginCount: plugins.length,
                    hasGraph: !!depGraph,
                    roots: depGraph?.roots ?? [],
                });
            },
            fetcher,
        );

        assert.ok(progressCalls.length >= 1, 'Should have received at least one progress callback');
        // All callbacks should include the graph
        for (const call of progressCalls) {
            assert.strictEqual(call.hasGraph, true, 'All progress callbacks should include depGraph');
            assert.deepStrictEqual(call.roots, ['user/marketplace-a']);
        }
    });

    it('should record redirect repos as edges in dependencyGraph', async () => {
        const responses: Record<string, RemoteDiscoveryResult> = {
            'user/extensions': {
                plugins: [makePlugin('my-plugin', 'user/extensions', ['my-skill'])],
                dependencies: ['obra/superpowers-marketplace'],
            },
            'obra/superpowers-marketplace': {
                plugins: [],
                dependencies: ['obra/superpowers', 'obra/superpowers-chrome'],
            },
            'obra/superpowers': {
                plugins: [makePlugin('superpowers', 'obra/superpowers', ['tdd'])],
                dependencies: [],
            },
            'obra/superpowers-chrome': {
                plugins: [makePlugin('superpowers-chrome', 'obra/superpowers-chrome', ['browsing'])],
                dependencies: [],
            },
        };

        const fetcher = async (repo: string): Promise<RemoteDiscoveryResult> => {
            const result = responses[repo];
            if (!result) { throw new Error(`Unknown repo: ${repo}`); }
            return result;
        };

        const { dependencyGraph } = await service.discoverAllPlugins(
            '/nonexistent/cache', ['user/extensions'], undefined, fetcher,
        );

        assert.deepStrictEqual(dependencyGraph.roots, ['user/extensions']);
        assert.deepStrictEqual(dependencyGraph.edges.get('user/extensions'), ['obra/superpowers-marketplace']);
        assert.deepStrictEqual(
            dependencyGraph.edges.get('obra/superpowers-marketplace'),
            ['obra/superpowers', 'obra/superpowers-chrome'],
        );
        assert.strictEqual(dependencyGraph.edges.has('obra/superpowers'), false);
        assert.strictEqual(dependencyGraph.edges.has('obra/superpowers-chrome'), false);
    });
});
