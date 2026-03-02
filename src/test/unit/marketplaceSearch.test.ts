import * as assert from 'assert';
import { buildSearchUrl, parseSearchResults, GitHubCodeSearchResponse } from '../../marketplaceSearch';

describe('buildSearchUrl', () => {
    it('should build code search URL with file signature', () => {
        const url = buildSearchUrl();
        assert.ok(url.includes('https://api.github.com/search/code'));
        assert.ok(url.includes('filename%3Amarketplace.json'));
        assert.ok(url.includes('path%3A.claude-plugin'));
    });

    it('should include user query when provided', () => {
        const url = buildSearchUrl('memory');
        assert.ok(url.includes('memory'));
        assert.ok(url.includes('filename%3Amarketplace.json'));
    });

    it('should encode special characters in query', () => {
        const url = buildSearchUrl('long term');
        assert.ok(url.includes('long+term') || url.includes('long%20term'));
    });
});

describe('parseSearchResults', () => {
    it('should extract repo info from GitHub code search response', () => {
        const response: GitHubCodeSearchResponse = {
            total_count: 2,
            items: [
                {
                    repository: {
                        full_name: 'obra/superpowers',
                        description: 'Superpowers for Claude',
                        stargazers_count: 150,
                        html_url: 'https://github.com/obra/superpowers',
                    },
                },
                {
                    repository: {
                        full_name: 'user/plugin',
                        description: 'A plugin',
                        stargazers_count: 42,
                        html_url: 'https://github.com/user/plugin',
                    },
                },
            ],
        };
        const results = parseSearchResults(response);
        assert.strictEqual(results.length, 2);
        assert.strictEqual(results[0].repo, 'obra/superpowers');
        assert.strictEqual(results[0].stars, 150);
        assert.strictEqual(results[1].repo, 'user/plugin');
    });

    it('should sort by stars descending', () => {
        const response: GitHubCodeSearchResponse = {
            total_count: 2,
            items: [
                {
                    repository: {
                        full_name: 'low-stars/repo',
                        description: 'Low',
                        stargazers_count: 5,
                        html_url: 'https://github.com/low-stars/repo',
                    },
                },
                {
                    repository: {
                        full_name: 'high-stars/repo',
                        description: 'High',
                        stargazers_count: 500,
                        html_url: 'https://github.com/high-stars/repo',
                    },
                },
            ],
        };
        const results = parseSearchResults(response);
        assert.strictEqual(results[0].repo, 'high-stars/repo');
        assert.strictEqual(results[0].stars, 500);
        assert.strictEqual(results[1].repo, 'low-stars/repo');
    });

    it('should deduplicate by repo name', () => {
        const response: GitHubCodeSearchResponse = {
            total_count: 3,
            items: [
                {
                    repository: {
                        full_name: 'obra/superpowers',
                        description: 'Superpowers',
                        stargazers_count: 150,
                        html_url: 'https://github.com/obra/superpowers',
                    },
                },
                {
                    repository: {
                        full_name: 'obra/superpowers',
                        description: 'Superpowers',
                        stargazers_count: 150,
                        html_url: 'https://github.com/obra/superpowers',
                    },
                },
                {
                    repository: {
                        full_name: 'other/repo',
                        description: 'Other',
                        stargazers_count: 10,
                        html_url: 'https://github.com/other/repo',
                    },
                },
            ],
        };
        const results = parseSearchResults(response);
        assert.strictEqual(results.length, 2);
    });

    it('should handle empty response', () => {
        const response: GitHubCodeSearchResponse = { total_count: 0, items: [] };
        const results = parseSearchResults(response);
        assert.strictEqual(results.length, 0);
    });

    it('should default stars to 0 when stargazers_count is missing', () => {
        const response: GitHubCodeSearchResponse = {
            total_count: 1,
            items: [
                {
                    repository: {
                        full_name: 'user/repo',
                        description: 'Test',
                        html_url: 'https://github.com/user/repo',
                    },
                },
            ],
        };
        const results = parseSearchResults(response);
        assert.strictEqual(results[0].stars, 0);
    });

    it('should handle null description gracefully', () => {
        const response: GitHubCodeSearchResponse = {
            total_count: 1,
            items: [
                {
                    repository: {
                        full_name: 'user/repo',
                        description: null,
                        stargazers_count: 10,
                        html_url: 'https://github.com/user/repo',
                    },
                },
            ],
        };
        const results = parseSearchResults(response);
        assert.strictEqual(results[0].description, '');
    });
});
