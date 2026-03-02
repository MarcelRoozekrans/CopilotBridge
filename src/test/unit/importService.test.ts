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
        assert.ok(result.instructionsContent);
        assert.ok(result.promptContent);
        assert.ok(result.registryEntry);
        assert.ok(result.originalContent);
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
