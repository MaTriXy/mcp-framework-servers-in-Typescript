/**
 * Configuration options for cache implementations.
 */
export interface CacheOptions {
  /** Maximum number of entries in the cache (default: 100) */
  maxEntries: number;
  /** Time-to-live in milliseconds (default: 300_000 = 5 min) */
  ttlMs: number;
}

/**
 * Cache statistics.
 */
export interface CacheStats {
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Current number of entries in cache */
  size: number;
}

/**
 * Generic cache interface for documentation content.
 */
export interface Cache {
  /** Get a value by key, returns null if missing or expired */
  get<T>(key: string): Promise<T | null>;
  /** Set a value with optional per-entry TTL override */
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  /** Delete a specific key */
  delete(key: string): Promise<void>;
  /** Clear all entries */
  clear(): Promise<void>;
  /** Get cache statistics */
  stats(): CacheStats;
}
