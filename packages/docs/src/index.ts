// Server
export { DocsServer } from './server.js';
export type { DocsServerConfig } from './server.js';

// Source types and interface
export type {
  DocSource,
  DocPage,
  DocSearchResult,
  DocSection,
  DocSearchOptions,
} from './sources/types.js';

// Source adapters
export { LlmsTxtSource } from './sources/llms-txt.js';
export type { LlmsTxtSourceConfig } from './sources/llms-txt.js';
export { FumadocsRemoteSource } from './sources/fumadocs-remote.js';
export type { FumadocsRemoteSourceConfig } from './sources/fumadocs-remote.js';
export { parseLlmsTxt } from './sources/llms-txt-parser.js';

// Cache
export { MemoryCache } from './cache/memory-cache.js';
export type { Cache, CacheOptions, CacheStats } from './cache/types.js';

// Tools
export { SearchDocsTool } from './tools/SearchDocsTool.js';
export { GetPageTool } from './tools/GetPageTool.js';
export { ListSectionsTool } from './tools/ListSectionsTool.js';

// Errors
export {
  DocSourceError,
  DocFetchError,
  DocParseError,
  DocNotFoundError,
} from './errors.js';

// Utilities
export { estimateTokens, truncateToTokenBudget, formatSearchResults } from './utils/tokens.js';
