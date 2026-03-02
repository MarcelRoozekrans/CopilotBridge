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
            stargazers_count?: number;
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
            stars: item.repository.stargazers_count ?? 0,
            url: item.repository.html_url,
        });
    }

    results.sort((a, b) => b.stars - a.stars);
    return results;
}

async function fetchRepoStars(
    repos: string[],
    headers: Record<string, string>
): Promise<Map<string, { stars: number; description: string }>> {
    const result = new Map<string, { stars: number; description: string }>();
    const fetches = repos.map(async (repo) => {
        try {
            const resp = await fetch(`https://api.github.com/repos/${repo}`, { headers });
            if (resp.ok) {
                const data = await resp.json() as { stargazers_count: number; description: string | null };
                result.set(repo, {
                    stars: data.stargazers_count ?? 0,
                    description: data.description ?? '',
                });
            }
        } catch {
            // Best-effort: keep code search defaults
        }
    });
    await Promise.all(fetches);
    return result;
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
    const results = parseSearchResults(data);

    // Code Search API returns minimal repo objects without star counts.
    // Batch-fetch full repo details to get accurate stars.
    const repoNames = results.map(r => r.repo);
    const repoDetails = await fetchRepoStars(repoNames, headers);

    for (const r of results) {
        const details = repoDetails.get(r.repo);
        if (details) {
            r.stars = details.stars;
            if (!r.description && details.description) {
                r.description = details.description;
            }
        }
    }

    results.sort((a, b) => b.stars - a.stars);
    return results;
}
