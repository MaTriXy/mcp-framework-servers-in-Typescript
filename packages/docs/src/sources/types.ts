/**
 * Represents a single documentation page.
 */
export interface DocPage {
  /** URL-friendly identifier for the page */
  slug: string;
  /** Full URL to the page */
  url: string;
  /** Page title */
  title: string;
  /** Brief description of the page content */
  description?: string;
  /** Full markdown/mdx body content */
  content: string;
  /** Top-level section this page belongs to */
  section?: string;
  /** ISO 8601 last modified date */
  lastModified?: string;
}

/**
 * Represents a search result from documentation.
 */
export interface DocSearchResult {
  /** URL-friendly identifier for the page */
  slug: string;
  /** Full URL to the page */
  url: string;
  /** Page title */
  title: string;
  /** Brief description of the page content */
  description?: string;
  /** Matched excerpt from the page */
  snippet: string;
  /** Top-level section this page belongs to */
  section?: string;
  /** Relevance score from 0 to 1 */
  score: number;
}

/**
 * Represents a section in the documentation tree.
 */
export interface DocSection {
  /** Section display name */
  name: string;
  /** URL-friendly identifier */
  slug: string;
  /** Full URL to the section */
  url: string;
  /** Child sections */
  children: DocSection[];
  /** Number of pages in this section (not counting children) */
  pageCount: number;
}

/**
 * Search options for DocSource.search().
 */
export interface DocSearchOptions {
  /** Filter results to a specific section */
  section?: string;
  /** Maximum number of results to return */
  limit?: number;
}

/**
 * The central abstraction for documentation backends.
 * Every documentation source implements this interface.
 */
export interface DocSource {
  /** Human-readable name for this source */
  name: string;

  /** Search documentation by query string */
  search(query: string, options?: DocSearchOptions): Promise<DocSearchResult[]>;

  /** Retrieve a single page by its slug */
  getPage(slug: string): Promise<DocPage | null>;

  /** List the documentation tree structure */
  listSections(): Promise<DocSection[]>;

  /** Get the llms.txt index content */
  getIndex(): Promise<string>;

  /** Get the full llms-full.txt content */
  getFullContent(): Promise<string>;

  /** Check if the documentation source is healthy */
  healthCheck(): Promise<{ ok: boolean; message?: string }>;
}
