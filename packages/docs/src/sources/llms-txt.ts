import { DocSource, DocPage, DocSearchResult, DocSearchOptions, DocSection } from './types.js';
import { Cache } from '../cache/types.js';
import { MemoryCache } from '../cache/memory-cache.js';
import { DocFetchError, DocParseError } from '../errors.js';
import { parseLlmsTxt } from './llms-txt-parser.js';

export interface LlmsTxtSourceConfig {
  /** Base URL of the documentation site */
  baseUrl: string;
  /** Path to llms.txt (default: "/llms.txt") */
  llmsTxtPath?: string;
  /** Path to llms-full.txt (default: "/llms-full.txt") */
  llmsFullTxtPath?: string;
  /** Path prefix for .mdx page fetching (default: "/") */
  mdxPathPrefix?: string;
  /** Cache TTL in milliseconds (default: 300_000 = 5 min) */
  refreshInterval?: number;
  /** Custom HTTP headers for all requests */
  headers?: Record<string, string>;
  /** Custom cache instance */
  cache?: Cache;
}

/**
 * Documentation source that consumes llms.txt and llms-full.txt endpoints.
 * Works with any site that publishes these files (Fumadocs, Docusaurus, etc.).
 */
export class LlmsTxtSource implements DocSource {
  private _name: string;
  protected readonly baseUrl: string;
  protected readonly llmsTxtPath: string;
  protected readonly llmsFullTxtPath: string;
  protected readonly mdxPathPrefix: string;
  protected readonly headers: Record<string, string>;
  protected readonly cache: Cache;
  protected readonly refreshInterval: number;

  constructor(config: LlmsTxtSourceConfig) {
    if (!config.baseUrl || !config.baseUrl.trim()) {
      throw new Error('baseUrl is required and cannot be empty');
    }

    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this._name = `llms-txt:${this.baseUrl}`;
    this.llmsTxtPath = config.llmsTxtPath ?? '/llms.txt';
    this.llmsFullTxtPath = config.llmsFullTxtPath ?? '/llms-full.txt';
    this.mdxPathPrefix = config.mdxPathPrefix ?? '/';
    this.headers = config.headers ?? {};
    this.refreshInterval = config.refreshInterval ?? 300_000;
    this.cache = config.cache ?? new MemoryCache({
      maxEntries: 100,
      ttlMs: this.refreshInterval,
    });
  }

  get name(): string {
    return this._name;
  }

  async getIndex(): Promise<string> {
    const cacheKey = `index:${this.baseUrl}`;
    const cached = await this.cache.get<string>(cacheKey);
    if (cached !== null) return cached;

    const url = `${this.baseUrl}${this.llmsTxtPath}`;
    const content = await this.fetchText(url);
    await this.cache.set(cacheKey, content);
    return content;
  }

  async getFullContent(): Promise<string> {
    const cacheKey = `full:${this.baseUrl}`;
    const cached = await this.cache.get<string>(cacheKey);
    if (cached !== null) return cached;

    const url = `${this.baseUrl}${this.llmsFullTxtPath}`;
    const content = await this.fetchText(url);
    await this.cache.set(cacheKey, content);
    return content;
  }

  async listSections(): Promise<DocSection[]> {
    const cacheKey = `sections:${this.baseUrl}`;
    const cached = await this.cache.get<DocSection[]>(cacheKey);
    if (cached !== null) return cached;

    const index = await this.getIndex();
    const { sections } = parseLlmsTxt(index, this.baseUrl);
    await this.cache.set(cacheKey, sections);
    return sections;
  }

  async getPage(slug: string): Promise<DocPage | null> {
    const normalizedSlug = this.normalizeSlug(slug);
    const cacheKey = `page:${normalizedSlug}`;
    const cached = await this.cache.get<DocPage>(cacheKey);
    if (cached !== null) return cached;

    // Try fetching .mdx endpoint first
    const page = await this.fetchMdxPage(normalizedSlug);
    if (page) {
      await this.cache.set(cacheKey, page);
      return page;
    }

    // Fall back to extracting from llms-full.txt
    const extracted = await this.extractPageFromFullContent(normalizedSlug);
    if (extracted) {
      await this.cache.set(cacheKey, extracted);
      return extracted;
    }

    return null;
  }

  async search(query: string, options?: DocSearchOptions): Promise<DocSearchResult[]> {
    const limit = Math.min(options?.limit ?? 10, 25);
    const section = options?.section;

    const cacheKey = `search:${query}:${section ?? ''}:${limit}`;
    const cached = await this.cache.get<DocSearchResult[]>(cacheKey);
    if (cached !== null) return cached;

    const fullContent = await this.getFullContent();
    const results = this.localSearch(fullContent, query, section, limit);
    await this.cache.set(cacheKey, results);
    return results;
  }

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    try {
      const url = `${this.baseUrl}${this.llmsTxtPath}`;
      const response = await fetch(url, {
        method: 'HEAD',
        headers: this.headers,
      });
      if (response.ok) {
        return { ok: true };
      }
      return { ok: false, message: `${response.status} ${response.statusText}` };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }

  /**
   * Perform local text search against full content.
   * Splits content into page blocks and scores each by query term frequency.
   */
  protected localSearch(
    fullContent: string,
    query: string,
    section: string | undefined,
    limit: number
  ): DocSearchResult[] {
    const pageBlocks = this.splitIntoPageBlocks(fullContent);
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);

    if (queryTerms.length === 0) return [];

    const scored: DocSearchResult[] = [];

    for (const block of pageBlocks) {
      // Filter by section if specified
      if (section && block.section?.toLowerCase() !== section.toLowerCase()) {
        continue;
      }

      const contentLower = block.content.toLowerCase();
      const titleLower = block.title.toLowerCase();

      // Score: title matches worth more than content matches
      let score = 0;
      let matchCount = 0;

      for (const term of queryTerms) {
        const titleMatches = countOccurrences(titleLower, term);
        const contentMatches = countOccurrences(contentLower, term);

        if (titleMatches > 0 || contentMatches > 0) {
          matchCount++;
          score += titleMatches * 3 + contentMatches;
        }
      }

      if (matchCount === 0) continue;

      // Normalize score to 0-1 range (approximate)
      const normalizedScore = Math.min(1, (matchCount / queryTerms.length) * 0.5 + score / (score + 10));

      const snippet = this.extractSnippet(block.content, queryTerms);

      scored.push({
        slug: block.slug,
        url: block.url,
        title: block.title,
        description: block.description,
        snippet,
        section: block.section,
        score: normalizedScore,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  /**
   * Split llms-full.txt into individual page blocks.
   * Pages in llms-full.txt are separated by `# Title (url)` headers.
   */
  protected splitIntoPageBlocks(fullContent: string): Array<{
    title: string;
    url: string;
    slug: string;
    content: string;
    description?: string;
    section?: string;
  }> {
    const blocks: Array<{
      title: string;
      url: string;
      slug: string;
      content: string;
      description?: string;
      section?: string;
    }> = [];

    // Match page headers: # Title (url) or # Title
    const headerPattern = /^#\s+([^\n(]+?)(?:\s*\(([^)]+)\))?\s*$/gm;
    const matches: Array<{ title: string; url: string; index: number }> = [];

    let match;
    while ((match = headerPattern.exec(fullContent)) !== null) {
      matches.push({
        title: match[1].trim(),
        url: match[2]?.trim() || '',
        index: match.index,
      });
    }

    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index + fullContent.slice(matches[i].index).indexOf('\n') + 1;
      const end = i + 1 < matches.length ? matches[i + 1].index : fullContent.length;
      const content = fullContent.slice(start, end).trim();

      const slug = this.deriveSlugFromUrl(matches[i].url);

      blocks.push({
        title: matches[i].title,
        url: matches[i].url,
        slug,
        content,
      });
    }

    return blocks;
  }

  /**
   * Extract a relevant snippet around the first match of any query term.
   */
  protected extractSnippet(content: string, queryTerms: string[]): string {
    const contentLower = content.toLowerCase();
    let bestPos = -1;

    for (const term of queryTerms) {
      const pos = contentLower.indexOf(term);
      if (pos !== -1 && (bestPos === -1 || pos < bestPos)) {
        bestPos = pos;
      }
    }

    if (bestPos === -1) {
      return content.slice(0, 200);
    }

    const snippetStart = Math.max(0, bestPos - 80);
    const snippetEnd = Math.min(content.length, bestPos + 120);
    let snippet = content.slice(snippetStart, snippetEnd).trim();

    if (snippetStart > 0) snippet = '...' + snippet;
    if (snippetEnd < content.length) snippet = snippet + '...';

    return snippet;
  }

  protected normalizeSlug(slug: string): string {
    return slug
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .replace(/^docs\//, '');
  }

  private async fetchMdxPage(slug: string): Promise<DocPage | null> {
    const url = `${this.baseUrl}${this.mdxPathPrefix}${slug}.mdx`;
    try {
      const content = await this.fetchText(url);

      // Extract title from first heading
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : slug;

      return {
        slug,
        url: `${this.baseUrl}${this.mdxPathPrefix}${slug}`,
        title,
        content,
      };
    } catch {
      return null;
    }
  }

  private async extractPageFromFullContent(slug: string): Promise<DocPage | null> {
    try {
      const fullContent = await this.getFullContent();
      const blocks = this.splitIntoPageBlocks(fullContent);

      for (const block of blocks) {
        if (block.slug === slug || block.url.endsWith(`/${slug}`)) {
          return {
            slug,
            url: block.url,
            title: block.title,
            content: block.content,
            section: block.section,
          };
        }
      }
    } catch {
      // Ignore errors from full content fetch
    }

    return null;
  }

  private deriveSlugFromUrl(url: string): string {
    let slug = url;

    // Strip base URL
    const base = this.baseUrl.replace(/\/+$/, '');
    if (slug.startsWith(base)) {
      slug = slug.slice(base.length);
    }

    // Try parsing as full URL
    try {
      const parsed = new URL(slug);
      slug = parsed.pathname;
    } catch {
      // Not a full URL
    }

    return slug.replace(/^\/+/, '').replace(/\/+$/, '');
  }

  protected async fetchText(url: string): Promise<string> {
    try {
      const response = await fetch(url, { headers: this.headers });
      if (!response.ok) {
        throw new DocFetchError(url, response.status, response.statusText);
      }
      return await response.text();
    } catch (error) {
      if (error instanceof DocFetchError) throw error;
      throw new DocFetchError(url, 0, (error as Error).message);
    }
  }
}

function countOccurrences(text: string, term: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(term, pos)) !== -1) {
    count++;
    pos += term.length;
  }
  return count;
}
