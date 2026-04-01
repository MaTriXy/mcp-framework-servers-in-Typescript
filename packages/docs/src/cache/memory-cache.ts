import { Cache, CacheOptions, CacheStats } from './types.js';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_OPTIONS: CacheOptions = {
  maxEntries: 100,
  ttlMs: 300_000, // 5 minutes
};

/**
 * In-memory LRU cache with TTL expiry.
 * Expired entries are lazily cleaned on access.
 */
export class MemoryCache implements Cache {
  private store = new Map<string, CacheEntry<unknown>>();
  private options: CacheOptions;
  private _hits = 0;
  private _misses = 0;

  constructor(options?: Partial<CacheOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);

    if (!entry) {
      this._misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this._misses++;
      return null;
    }

    // Move to end for LRU ordering (Map preserves insertion order)
    this.store.delete(key);
    this.store.set(key, entry);

    this._hits++;
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    // If key exists, delete first to reset position
    if (this.store.has(key)) {
      this.store.delete(key);
    }

    // Evict oldest entry if at capacity
    if (this.store.size >= this.options.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }

    const expiresAt = Date.now() + (ttlMs ?? this.options.ttlMs);
    this.store.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
    this._hits = 0;
    this._misses = 0;
  }

  stats(): CacheStats {
    return {
      hits: this._hits,
      misses: this._misses,
      size: this.store.size,
    };
  }
}
