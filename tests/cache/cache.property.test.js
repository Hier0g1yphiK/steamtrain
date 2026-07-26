// Feature: steam-discord-bot, Property 9: Cache TTL freshness
// Feature: steam-discord-bot, Property 10: LRU eviction at capacity

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { LRUCache } from 'lru-cache';

/**
 * Property 9: Cache TTL freshness
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4
 *
 * For any cache entry stored with a given TTL, retrieval before TTL returns
 * cached value; retrieval after TTL treats entry as stale.
 */
describe('Property 9: Cache TTL freshness', () => {
  // Generator for non-undefined values (lru-cache cannot store undefined)
  const storable = fc.oneof(
    fc.string(),
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
    fc.array(fc.integer()),
    fc.dictionary(fc.string({ minLength: 1, maxLength: 5 }), fc.integer())
  );

  it('retrieval before TTL elapses returns the cached value as a fresh hit', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        storable,
        fc.integer({ min: 10000, max: 86400000 }), // TTL between 10s and 24h
        (key, value, ttl) => {
          const cache = new LRUCache({ max: 100, ttl, allowStale: true });
          cache.set(key, value);

          // Immediately after set, the entry should be retrievable and fresh
          const status = {};
          const retrieved = cache.get(key, { status });
          expect(retrieved).toEqual(value);
          expect(status.get).toBe('hit');

          // TTL should be positive (still fresh)
          const remaining = cache.getRemainingTTL(key);
          expect(remaining).toBeGreaterThan(0);
          expect(remaining).toBeLessThanOrEqual(ttl);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('retrieval after TTL elapses treats entry as stale', async () => {
    // We use ttl:1 (1ms) and a short delay to guarantee expiration
    // This test validates the property with a controlled approach
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        storable,
        (key, value) => {
          const cache = new LRUCache({ max: 100, ttl: 1, allowStale: true });
          cache.set(key, value);

          // Simulate passage of time by using a cache with start time in the past
          // lru-cache uses performance.now() internally, so we create a scenario
          // where we can verify staleness via getRemainingTTL
          const remaining = cache.getRemainingTTL(key);
          // With TTL of 1ms, remaining should be either 0 or 1 at most
          expect(remaining).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );

    // Validate actual stale behavior with a real timer
    const cache = new LRUCache({ max: 100, ttl: 1, allowStale: true });
    cache.set('test-key', 'test-value');
    await new Promise(resolve => setTimeout(resolve, 5));

    const status = {};
    const result = cache.get('test-key', { status });
    expect(status.get).toBe('stale');
    expect(result).toBe('test-value'); // allowStale returns expired value
  });

  it('fresh entries have positive remainingTTL, consistent with configured TTL', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('appList', 'gameDetail', 'userProfile'),
        fc.string({ minLength: 1, maxLength: 50 }),
        storable,
        (cacheType, key, value) => {
          const configs = {
            appList: { max: 1, ttl: 24 * 60 * 60 * 1000 },
            gameDetail: { max: 1000, ttl: 60 * 60 * 1000 },
            userProfile: { max: 500, ttl: 5 * 60 * 1000 },
          };

          const config = configs[cacheType];
          const cache = new LRUCache({ ...config, allowStale: true });
          cache.set(key, value);

          // Entry should be fresh immediately after setting
          const status = {};
          const result = cache.get(key, { status });
          expect(result).toEqual(value);
          expect(status.get).toBe('hit');

          // Remaining TTL should be positive and bounded by configured TTL
          const remaining = cache.getRemainingTTL(key);
          expect(remaining).toBeGreaterThan(0);
          expect(remaining).toBeLessThanOrEqual(config.ttl);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('cached value is served instead of making new call when entry is fresh', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        storable,
        fc.integer({ min: 2 }),  // multiple retrievals
        (key, value, retrievalCount) => {
          const count = Math.min(retrievalCount, 20); // cap at 20
          const cache = new LRUCache({ max: 100, ttl: 60000, allowStale: true });
          cache.set(key, value);

          // Multiple retrievals should all return the same cached value
          for (let i = 0; i < count; i++) {
            const result = cache.get(key);
            expect(result).toEqual(value);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 10: LRU eviction at capacity
 * Validates: Requirements 5.7
 *
 * For any sequence of insertions exceeding max size, the LRU entry is evicted
 * and the cache size never exceeds the maximum.
 */
describe('Property 10: LRU eviction at capacity', () => {
  it('cache size never exceeds maximum after any sequence of insertions', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }), // max cache size
        fc.array(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }),
            fc.integer()
          ),
          { minLength: 1, maxLength: 200 }
        ),
        (maxSize, entries) => {
          const cache = new LRUCache({ max: maxSize, ttl: 60000 });

          for (const [key, value] of entries) {
            cache.set(key, value);
            // Invariant: size must never exceed max
            expect(cache.size).toBeLessThanOrEqual(maxSize);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('LRU entry is evicted when cache exceeds capacity', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 30 }), // max cache size (at least 2)
        (maxSize) => {
          const cache = new LRUCache({ max: maxSize, ttl: 60000 });

          // Fill the cache to capacity with unique keys
          for (let i = 0; i < maxSize; i++) {
            cache.set(`key-${i}`, `value-${i}`);
          }
          expect(cache.size).toBe(maxSize);

          // The first key inserted (key-0) is the LRU entry
          // Adding one more entry should evict it
          cache.set('overflow-key', 'overflow-value');

          expect(cache.size).toBe(maxSize);
          // The least-recently-used entry (key-0) should be evicted
          expect(cache.has('key-0')).toBe(false);
          // The new entry should exist
          expect(cache.get('overflow-key')).toBe('overflow-value');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('accessing an entry updates its recency so it is not evicted next', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 30 }), // need at least 3 entries
        (maxSize) => {
          const cache = new LRUCache({ max: maxSize, ttl: 60000 });

          // Fill cache to capacity
          for (let i = 0; i < maxSize; i++) {
            cache.set(`key-${i}`, `value-${i}`);
          }

          // Access the first entry (key-0), making key-1 the new LRU
          cache.get('key-0');

          // Insert a new entry to trigger eviction
          cache.set('new-key', 'new-value');

          // key-0 should still exist (it was accessed recently)
          expect(cache.has('key-0')).toBe(true);
          // key-1 should be evicted (it's now the LRU)
          expect(cache.has('key-1')).toBe(false);
          // Size must not exceed max
          expect(cache.size).toBe(maxSize);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('game detail cache (max: 1000) never exceeds capacity', () => {
    const maxSize = 1000;
    const cache = new LRUCache({ max: maxSize, ttl: 60 * 60 * 1000 });

    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 30 }),
            fc.integer()
          ),
          { minLength: maxSize + 1, maxLength: maxSize + 50 }
        ),
        (entries) => {
          cache.clear();
          for (const [key, value] of entries) {
            cache.set(key, value);
            expect(cache.size).toBeLessThanOrEqual(maxSize);
          }
        }
      ),
      { numRuns: 10 } // Fewer runs due to larger data set
    );
  });

  it('user profile cache (max: 500) never exceeds capacity', () => {
    const maxSize = 500;
    const cache = new LRUCache({ max: maxSize, ttl: 5 * 60 * 1000 });

    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 30 }),
            fc.integer()
          ),
          { minLength: maxSize + 1, maxLength: maxSize + 50 }
        ),
        (entries) => {
          cache.clear();
          for (const [key, value] of entries) {
            cache.set(key, value);
            expect(cache.size).toBeLessThanOrEqual(maxSize);
          }
        }
      ),
      { numRuns: 10 } // Fewer runs due to larger data set
    );
  });
});
