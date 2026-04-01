import { DocSearchResult, DocSearchOptions } from './types.js';
import { LlmsTxtSource, LlmsTxtSourceConfig } from './llms-txt.js';
import { DocFetchError } from '../errors.js';

export interface FumadocsRemoteSourceConfig extends LlmsTxtSourceConfig {
  /** Fumadocs search API endpoint (default: "/api/search") */
  searchEndpoint?: string;
  /** Pattern for individual page MDX fetching (default: "{slug}.mdx") */
  mdxPathPattern?: string;
}

interface FumadocsSearchResult {
  id: string;
  url: string;
  type: string;
  content: string;
  structured?: {
    heading?: string;
  };
}

/**
 * Documentation source for Fumadocs sites with Orama search API.
 * Extends LlmsTxtSource with native search via Fumadocs' search endpoint.
 * Falls back to local text search when the API is unavailable.
 */
export class FumadocsRemoteSource extends LlmsTxtSource {
  private readonly searchEndpoint: string;

  constructor(config: FumadocsRemoteSourceConfig) {
    super(config);
    this.searchEndpoint = config.searchEndpoint ?? '/api/search';
  }

  override get name(): string {
    return `fumadocs:${this.baseUrl}`;
  }

  override async search(query: string, options?: DocSearchOptions): Promise<DocSearchResult[]> {
    const limit = Math.min(options?.limit ?? 10, 25);
    const section = options?.section;

    const cacheKey = `fumadocs-search:${query}:${section ?? ''}:${limit}`;
    const cached = await this.cache.get<DocSearchResult[]>(cacheKey);
    if (cached !== null) return cached;

    try {
      const results = await this.fumadocsSearch(query, section, limit);
      await this.cache.set(cacheKey, results);
      return results;
    } catch {
      // Fall back to local text search
      return super.search(query, options);
    }
  }

  private async fumadocsSearch(
    query: string,
    section: string | undefined,
    limit: number
  ): Promise<DocSearchResult[]> {
    const params = new URLSearchParams({ query });
    if (section) {
      params.set('tag', section);
    }

    const url = `${this.baseUrl}${this.searchEndpoint}?${params.toString()}`;
    const response = await fetch(url, { headers: this.headers });

    if (!response.ok) {
      throw new DocFetchError(url, response.status, response.statusText);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      throw new DocFetchError(url, response.status, 'Response is not JSON');
    }

    const data: FumadocsSearchResult[] = await response.json();

    if (!Array.isArray(data)) {
      throw new DocFetchError(url, response.status, 'Response is not an array');
    }

    const results: DocSearchResult[] = data.slice(0, limit).map((item, index) => {
      const slug = this.deriveSlug(item.url || item.id);
      const pageUrl = item.url?.startsWith('http')
        ? item.url
        : `${this.baseUrl}${item.url || item.id}`;

      return {
        slug,
        url: pageUrl,
        title: item.structured?.heading || this.titleFromSlug(slug),
        snippet: item.content?.slice(0, 200) || '',
        section: item.structured?.heading,
        score: 1 - index / Math.max(data.length, 1), // Normalize position to score
      };
    });

    return results;
  }

  private deriveSlug(urlOrPath: string): string {
    let slug = urlOrPath;

    const base = this.baseUrl.replace(/\/+$/, '');
    if (slug.startsWith(base)) {
      slug = slug.slice(base.length);
    }

    try {
      const parsed = new URL(slug);
      slug = parsed.pathname;
    } catch {
      // Not a full URL
    }

    return slug.replace(/^\/+/, '').replace(/\/+$/, '');
  }

  private titleFromSlug(slug: string): string {
    const last = slug.split('/').pop() || slug;
    return last
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }
}
