import * as assert from 'assert';
import { buildGitHubApiUrl, parseGitHubContentsResponse, buildRemoteSkillInfo, normalizeMarketplaceJson, GitHubApiError } from '../../remoteReader';

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
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].source, './');
    });

    it('should handle nested marketplace.plugins with path field', () => {
        const result = normalizeMarketplaceJson({
            marketplace: {
                name: 'toolkit',
                plugins: [{ name: 'a11y', description: 'audit', version: '1.0.0', path: 'plugins/a11y-audit' }],
            },
        });
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].name, 'a11y');
        assert.strictEqual(result[0].source, 'plugins/a11y-audit');
    });

    it('should default source to ./ when neither source nor path is present', () => {
        const result = normalizeMarketplaceJson({
            plugins: [{ name: 'test', description: 'd', version: '1.0.0' }],
        });
        assert.strictEqual(result[0].source, './');
    });

    it('should prefer top-level plugins over marketplace.plugins', () => {
        const result = normalizeMarketplaceJson({
            plugins: [{ name: 'top', description: 'd', version: '1.0.0', source: './' }],
            marketplace: {
                plugins: [{ name: 'nested', description: 'd', version: '1.0.0', path: 'x' }],
            },
        });
        // marketplace.plugins is fallback; top-level plugins takes precedence
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].name, 'top');
    });

    it('should return empty array when no plugins found', () => {
        const result = normalizeMarketplaceJson({ name: 'empty' });
        assert.strictEqual(result.length, 0);
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
