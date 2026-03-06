import * as assert from 'assert';
import { buildGitHubApiUrl, parseGitHubContentsResponse, buildRemoteSkillInfo, normalizeMarketplaceJson, extractDependencies, parseGitHubRepoFromUrl, GitHubApiError } from '../../remoteReader';

describe('buildGitHubApiUrl', () => {
    it('should build correct contents API URL', () => {
        const url = buildGitHubApiUrl('obra/superpowers', '.claude-plugin/plugin.json');
        assert.strictEqual(url, 'https://api.github.com/repos/obra/superpowers/contents/.claude-plugin/plugin.json');
    });

    it('should build correct URL with ref', () => {
        const url = buildGitHubApiUrl('obra/superpowers', 'skills', 'main');
        assert.strictEqual(url, 'https://api.github.com/repos/obra/superpowers/contents/skills?ref=main');
    });
});

describe('parseGitHubContentsResponse', () => {
    it('should decode base64 content from GitHub API response', () => {
        const response = {
            content: Buffer.from('Hello World').toString('base64'),
            encoding: 'base64',
        };
        const result = parseGitHubContentsResponse(response);
        assert.strictEqual(result, 'Hello World');
    });
});

describe('buildRemoteSkillInfo', () => {
    it('should set source to remote', () => {
        const skill = buildRemoteSkillInfo('tdd', 'TDD skill', '# Content', 'superpowers', '4.3.1', 'obra/superpowers');
        assert.strictEqual(skill.source, 'remote');
        assert.strictEqual(skill.marketplace, 'obra/superpowers');
    });
});

describe('normalizeMarketplaceJson', () => {
    it('should handle top-level plugins with source field', () => {
        const result = normalizeMarketplaceJson({
            name: 'superpowers',
            plugins: [{ name: 'sp', description: 'desc', version: '1.0.0', source: './' }],
        });
        assert.strictEqual(result.plugins.length, 1);
        assert.strictEqual(result.plugins[0].source, './');
        assert.strictEqual(result.sourceRedirectRepos.length, 0);
    });

    it('should handle nested marketplace.plugins with path field', () => {
        const result = normalizeMarketplaceJson({
            marketplace: {
                name: 'toolkit',
                plugins: [{ name: 'a11y', description: 'audit', version: '1.0.0', path: 'plugins/a11y-audit' }],
            },
        });
        assert.strictEqual(result.plugins.length, 1);
        assert.strictEqual(result.plugins[0].name, 'a11y');
        assert.strictEqual(result.plugins[0].source, 'plugins/a11y-audit');
    });

    it('should default source to ./ when neither source nor path is present', () => {
        const result = normalizeMarketplaceJson({
            plugins: [{ name: 'test', description: 'd', version: '1.0.0' }],
        });
        assert.strictEqual(result.plugins[0].source, './');
    });

    it('should prefer top-level plugins over marketplace.plugins', () => {
        const result = normalizeMarketplaceJson({
            plugins: [{ name: 'top', description: 'd', version: '1.0.0', source: './' }],
            marketplace: {
                plugins: [{ name: 'nested', description: 'd', version: '1.0.0', path: 'x' }],
            },
        });
        assert.strictEqual(result.plugins.length, 1);
        assert.strictEqual(result.plugins[0].name, 'top');
    });

    it('should return empty array when no plugins found', () => {
        const result = normalizeMarketplaceJson({ name: 'empty' });
        assert.strictEqual(result.plugins.length, 0);
        assert.strictEqual(result.sourceRedirectRepos.length, 0);
    });

    it('should extract redirect repos from object-based source.url entries', () => {
        const result = normalizeMarketplaceJson({
            plugins: [
                { name: 'superpowers', description: 'skills', version: '4.3.1', source: { source: 'url', url: 'https://github.com/obra/superpowers.git' } },
                { name: 'local-plugin', description: 'local', version: '1.0.0', source: './' },
            ],
        });
        // Object-based source entry is skipped from plugins, added to redirects
        assert.strictEqual(result.plugins.length, 1);
        assert.strictEqual(result.plugins[0].name, 'local-plugin');
        assert.deepStrictEqual(result.sourceRedirectRepos, ['obra/superpowers']);
    });

    it('should handle all plugins being redirects', () => {
        const result = normalizeMarketplaceJson({
            plugins: [
                { name: 'a', description: 'd', version: '1.0.0', source: { source: 'url', url: 'https://github.com/owner/repo-a.git' } },
                { name: 'b', description: 'd', version: '1.0.0', source: { source: 'url', url: 'https://github.com/owner/repo-b.git' } },
            ],
        });
        assert.strictEqual(result.plugins.length, 0);
        assert.deepStrictEqual(result.sourceRedirectRepos, ['owner/repo-a', 'owner/repo-b']);
    });

    it('should skip redirect entries with invalid URLs', () => {
        const result = normalizeMarketplaceJson({
            plugins: [
                { name: 'bad', description: 'd', version: '1.0.0', source: { source: 'url', url: 'not-a-github-url' } },
            ],
        });
        assert.strictEqual(result.plugins.length, 0);
        assert.strictEqual(result.sourceRedirectRepos.length, 0);
    });
});

describe('parseGitHubRepoFromUrl', () => {
    it('should parse https://github.com/owner/repo.git', () => {
        assert.strictEqual(parseGitHubRepoFromUrl('https://github.com/obra/superpowers.git'), 'obra/superpowers');
    });

    it('should parse https://github.com/owner/repo without .git', () => {
        assert.strictEqual(parseGitHubRepoFromUrl('https://github.com/owner/repo'), 'owner/repo');
    });

    it('should return undefined for non-GitHub URLs', () => {
        assert.strictEqual(parseGitHubRepoFromUrl('https://gitlab.com/owner/repo'), undefined);
    });

    it('should return undefined for invalid URLs', () => {
        assert.strictEqual(parseGitHubRepoFromUrl('not-a-url'), undefined);
    });
});

describe('buildRemoteSkillInfo with companions', () => {
    it('should include companionFiles when provided', () => {
        const companions = [{ name: 'rules.md', content: '# Rules' }];
        const skill = buildRemoteSkillInfo('tdd', 'TDD', '# Content', 'sp', '1.0.0', 'obra/sp', companions);
        assert.strictEqual(skill.companionFiles?.length, 1);
        assert.strictEqual(skill.companionFiles![0].name, 'rules.md');
    });

    it('should default to undefined when no companions', () => {
        const skill = buildRemoteSkillInfo('tdd', 'TDD', '# Content', 'sp', '1.0.0', 'obra/sp');
        assert.strictEqual(skill.companionFiles, undefined);
    });

    it('should default to undefined when empty array', () => {
        const skill = buildRemoteSkillInfo('tdd', 'TDD', '# Content', 'sp', '1.0.0', 'obra/sp', []);
        assert.strictEqual(skill.companionFiles, undefined);
    });
});

describe('extractDependencies', () => {
    it('should extract gh: prefixed dependencies', () => {
        const result = extractDependencies({
            dependencies: ['gh:obra/superpowers-marketplace', 'gh:user/repo'],
        });
        assert.deepStrictEqual(result, ['obra/superpowers-marketplace', 'user/repo']);
    });

    it('should handle dependencies without gh: prefix', () => {
        const result = extractDependencies({
            dependencies: ['owner/repo'],
        });
        assert.deepStrictEqual(result, ['owner/repo']);
    });

    it('should return empty array when no dependencies', () => {
        const result = extractDependencies({ name: 'empty' });
        assert.strictEqual(result.length, 0);
    });

    it('should filter out invalid entries without slash', () => {
        const result = extractDependencies({
            dependencies: ['gh:valid/repo', 'invalid-no-slash'],
        });
        assert.deepStrictEqual(result, ['valid/repo']);
    });

    it('should read dependencies from nested marketplace key', () => {
        const result = extractDependencies({
            marketplace: {
                dependencies: ['gh:nested/dep'],
            },
        });
        assert.deepStrictEqual(result, ['nested/dep']);
    });

    it('should prefer top-level dependencies over nested', () => {
        const result = extractDependencies({
            dependencies: ['gh:top/dep'],
            marketplace: {
                dependencies: ['gh:nested/dep'],
            },
        });
        assert.deepStrictEqual(result, ['top/dep']);
    });
});

describe('GitHubApiError', () => {
    it('should identify 401 as requiring auth', () => {
        const err = new GitHubApiError(401, 'Unauthorized');
        assert.strictEqual(err.requiresAuth, true);
        assert.strictEqual(err.status, 401);
        assert.ok(err.message.includes('401'));
    });

    it('should identify 403 as requiring auth', () => {
        const err = new GitHubApiError(403, 'Forbidden');
        assert.strictEqual(err.requiresAuth, true);
    });

    it('should not flag 404 as requiring auth', () => {
        const err = new GitHubApiError(404, 'Not Found');
        assert.strictEqual(err.requiresAuth, false);
    });

    it('should not flag 500 as requiring auth', () => {
        const err = new GitHubApiError(500, 'Internal Server Error');
        assert.strictEqual(err.requiresAuth, false);
    });
});
