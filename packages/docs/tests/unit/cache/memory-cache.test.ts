import { describe, test, expect, beforeEach } from '@jest/globals';
import { MemoryCache } from '../../../src/cache/memory-cache.js';

describe('MemoryCache', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache({ maxEntries: 3, ttlMs: 1000 });
  });

  test('get() returns null for unknown key', async () => {
    expect(await cache.get('nonexistent')).toBeNull();
  });

  test('set() then get() returns stored value', async () => {
    await cache.set('key1', { data: 'hello' });
    expect(await cache.get('key1')).toEqual({ data: 'hello' });
  });

  test('entry expires after TTL', async () => {
    cache = new MemoryCache({ maxEntries: 10, ttlMs: 50 });
    await cache.set('key1', 'value');
    expect(await cache.get('key1')).toBe('value');

    await new Promise((r) => setTimeout(r, 60));
    expect(await cache.get('key1')).toBeNull();
  });

  test('LRU eviction when maxEntries exceeded', async () => {
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.set('c', 3);
    // Cache is full (3 entries). Adding 'd' should evict 'a' (oldest)
    await cache.set('d', 4);

    expect(await cache.get('a')).toBeNull();
    expect(await cache.get('b')).toBe(2);
    expect(await cache.get('c')).toBe(3);
    expect(await cache.get('d')).toBe(4);
  });

  test('delete() removes entry and decrements size', async () => {
    await cache.set('key1', 'value');
    expect(cache.stats().size).toBe(1);
    await cache.delete('key1');
    expect(cache.stats().size).toBe(0);
    expect(await cache.get('key1')).toBeNull();
  });

  test('clear() resets to empty', async () => {
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.clear();
    expect(cache.stats().size).toBe(0);
    expect(cache.stats().hits).toBe(0);
    expect(cache.stats().misses).toBe(0);
  });

  test('stats() accurately tracks hits and misses', async () => {
    await cache.set('key1', 'value');
    await cache.get('key1'); // hit
    await cache.get('key1'); // hit
    await cache.get('missing'); // miss

    const s = cache.stats();
    expect(s.hits).toBe(2);
    expect(s.misses).toBe(1);
    expect(s.size).toBe(1);
  });

  test('custom TTL per entry overrides default', async () => {
    cache = new MemoryCache({ maxEntries: 10, ttlMs: 5000 });
    await cache.set('short', 'value', 50); // 50ms TTL
    await cache.set('long', 'value', 10000); // 10s TTL

    await new Promise((r) => setTimeout(r, 60));
    expect(await cache.get('short')).toBeNull(); // expired
    expect(await cache.get('long')).toBe('value'); // still alive
  });

  test('storing same key overwrites previous value and resets TTL', async () => {
    cache = new MemoryCache({ maxEntries: 10, ttlMs: 100 });
    await cache.set('key', 'first');
    await new Promise((r) => setTimeout(r, 60));
    // Overwrite resets TTL
    await cache.set('key', 'second');
    await new Promise((r) => setTimeout(r, 60));
    // Should still be alive (TTL reset)
    expect(await cache.get('key')).toBe('second');
  });
});
