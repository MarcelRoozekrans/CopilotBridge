import { MarketplaceSearchResult } from './types';
import { buildAuthHeaders, getGitHubToken } from './auth';

const SEARCH_BASE = 'https://api.github.com/search/code';
const FILE_SIGNATURE = 'filename:marketplace.json path:.claude-plugin';

export function buildSearchUrl(query?: string): string {
    const q = query
        ? `${query} ${FILE_SIGNATURE}`
        : FILE_SIGNATURE;
    return `${SEARCH_BASE}?q=${encodeURIComponent(q)}&per_page=30`;
}

export interface GitHubCodeSearchResponse {
    total_count: number;
    items: Array<{
        repository: {
            full_name: string;
            description: string | null;
            stargazers_count: number;
            html_url: string;
        };
    }>;
}

export function parseSearchResults(response: GitHubCodeSearchResponse): MarketplaceSearchResult[] {
    const seen = new Set<string>();
    const results: MarketplaceSearchResult[] = [];

    for (const item of response.items) {
        const repo = item.repository.full_name;
        if (seen.has(repo)) { continue; }
        seen.add(repo);
        results.push({
            repo,
            description: item.repository.description ?? '',
            stars: item.repository.stargazers_count,
            url: item.repository.html_url,
        });
    }

    results.sort((a, b) => b.stars - a.stars);
    return results;
}

export async function searchMarketplaces(query?: string): Promise<MarketplaceSearchResult[]> {
    const url = buildSearchUrl(query);
    const token = await getGitHubToken();
    const headers = buildAuthHeaders(token);
    const response = await fetch(url, { headers });

    if (!response.ok) {
        throw new Error(`GitHub search failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as GitHubCodeSearchResponse;
    return parseSearchResults(data);
}
