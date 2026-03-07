import * as assert from 'assert';
import * as vscode from 'vscode';
import { slugifySkillName, installPluginInClaudeCache } from '../../claudeInstaller';
import { PluginInfo } from '../../types';

describe('slugifySkillName', () => {
    it('should convert spaces to hyphens', () => {
        assert.strictEqual(slugifySkillName('my skill name'), 'my-skill-name');
    });

    it('should pass through already-kebab-case', () => {
        assert.strictEqual(slugifySkillName('my-skill-name'), 'my-skill-name');
    });

    it('should strip non-alphanumeric characters', () => {
        assert.strictEqual(slugifySkillName('my_skill!@#name'), 'my-skill-name');
    });

    it('should collapse multiple hyphens', () => {
        assert.strictEqual(slugifySkillName('my---skill   name'), 'my-skill-name');
    });

    it('should strip leading and trailing hyphens', () => {
        assert.strictEqual(slugifySkillName('--my-skill--'), 'my-skill');
    });

    it('should lowercase uppercase letters', () => {
        assert.strictEqual(slugifySkillName('My Skill Name'), 'my-skill-name');
    });
});

describe('installPluginInClaudeCache', () => {
    let writtenFiles: Array<{ path: string; content: string }>;
    let createdDirs: string[];
    const origWriteFile = vscode.workspace.fs.writeFile;
    const origCreateDirectory = vscode.workspace.fs.createDirectory;

    beforeEach(() => {
        writtenFiles = [];
        createdDirs = [];
        (vscode.workspace.fs as any).writeFile = async (uri: any, buf: Uint8Array) => {
            writtenFiles.push({
                path: uri.fsPath,
                content: Buffer.from(buf).toString('utf-8'),
            });
        };
        (vscode.workspace.fs as any).createDirectory = async (uri: any) => {
            createdDirs.push(uri.fsPath);
        };
    });

    afterEach(() => {
        (vscode.workspace.fs as any).writeFile = origWriteFile;
        (vscode.workspace.fs as any).createDirectory = origCreateDirectory;
    });

    function makePlugin(overrides?: Partial<PluginInfo>): PluginInfo {
        return {
            name: 'test-plugin',
            description: 'A test plugin',
            version: '1.0.0',
            skills: [
                {
                    name: 'My Skill',
                    description: 'A skill',
                    content: '# My Skill\nDo things.',
                    pluginName: 'test-plugin',
                    pluginVersion: '1.0.0',
                    marketplace: 'owner/repo',
                    source: 'remote',
                    companionFiles: [
                        { name: 'guide.md', content: '# Guide\nSome guide.' },
                    ],
                },
            ],
            marketplace: 'owner/repo',
            source: 'remote',
            ...overrides,
        };
    }

    const pluginJsonContent = JSON.stringify({ name: 'test-plugin', description: 'A test plugin', version: '1.0.0' });

    it('should write SKILL.md for each skill', async () => {
        const plugin = makePlugin();
        await installPluginInClaudeCache(plugin, '/tmp/cache', pluginJsonContent);
        const skillFile = writtenFiles.find(f => f.path.includes('SKILL.md'));
        assert.ok(skillFile, 'SKILL.md should be written');
        assert.strictEqual(skillFile!.content, '# My Skill\nDo things.');
    });

    it('should write companion files alongside SKILL.md', async () => {
        const plugin = makePlugin();
        await installPluginInClaudeCache(plugin, '/tmp/cache', pluginJsonContent);
        const companionFile = writtenFiles.find(f => f.path.includes('guide.md'));
        assert.ok(companionFile, 'companion file should be written');
        assert.strictEqual(companionFile!.content, '# Guide\nSome guide.');
    });

    it('should write plugin.json to .claude-plugin directory', async () => {
        const plugin = makePlugin();
        await installPluginInClaudeCache(plugin, '/tmp/cache', pluginJsonContent);
        const pjFile = writtenFiles.find(f => f.path.includes('plugin.json'));
        assert.ok(pjFile, 'plugin.json should be written');
        assert.ok(pjFile!.path.includes('.claude-plugin'));
        assert.strictEqual(pjFile!.content, pluginJsonContent);
    });

    it('should write .mcp.json when plugin has MCP servers', async () => {
        const plugin = makePlugin({
            mcpServers: [
                {
                    name: 'my-server',
                    config: { command: 'node', args: ['server.js'] },
                    pluginName: 'test-plugin',
                    pluginVersion: '1.0.0',
                    marketplace: 'owner/repo',
                },
            ],
        });
        await installPluginInClaudeCache(plugin, '/tmp/cache', pluginJsonContent);
        const mcpFile = writtenFiles.find(f => f.path.includes('.mcp.json'));
        assert.ok(mcpFile, '.mcp.json should be written');
        const parsed = JSON.parse(mcpFile!.content);
        assert.deepStrictEqual(parsed, {
            'my-server': { command: 'node', args: ['server.js'] },
        });
    });

    it('should skip .mcp.json when no MCP servers', async () => {
        const plugin = makePlugin({ mcpServers: undefined });
        await installPluginInClaudeCache(plugin, '/tmp/cache', pluginJsonContent);
        const mcpFile = writtenFiles.find(f => f.path.includes('.mcp.json'));
        assert.strictEqual(mcpFile, undefined, '.mcp.json should not be written');
    });

    it('should use marketplace slug with / replaced by -', async () => {
        const plugin = makePlugin({ marketplace: 'owner/repo' });
        await installPluginInClaudeCache(plugin, '/tmp/cache', pluginJsonContent);
        const pjFile = writtenFiles.find(f => f.path.includes('plugin.json'));
        assert.ok(pjFile);
        assert.ok(pjFile!.path.includes('owner-repo'), `path should contain owner-repo but was ${pjFile!.path}`);
        assert.ok(!pjFile!.path.includes('owner/repo'), 'path should not contain owner/repo');
    });

    it('should use slugified skill name for skill directory', async () => {
        const plugin = makePlugin();
        await installPluginInClaudeCache(plugin, '/tmp/cache', pluginJsonContent);
        const skillFile = writtenFiles.find(f => f.path.includes('SKILL.md'));
        assert.ok(skillFile);
        // "My Skill" -> "my-skill"
        assert.ok(skillFile!.path.includes('my-skill'), `path should contain slugified skill name but was ${skillFile!.path}`);
    });
});
