import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SteamClient } from './steamClient.js';
import { TimeoutError, ApiError } from '../utils/errors.js';

// Mock logger to avoid console output during tests
vi.mock('../utils/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

function createMockCache() {
  function makeCache() {
    const store = new Map();
    return {
      get(key, options) {
        return store.get(key);
      },
      set(key, value) {
        store.set(key, value);
      },
    };
  }
  return {
    appListCache: makeCache(),
    gameDetailCache: makeCache(),
    userProfileCache: makeCache(),
  };
}

/**
 * Creates a mock cache that supports allowStale option.
 * Stale entries are stored separately and returned when { allowStale: true } is passed.
 */
function createStaleAwareCache() {
  function makeCache() {
    const store = new Map();
    const staleStore = new Map();
    return {
      get(key, options) {
        if (options?.allowStale && staleStore.has(key)) {
          return staleStore.get(key);
        }
        return store.get(key);
      },
      set(key, value) {
        store.set(key, value);
        staleStore.set(key, value);
      },
      // Simulate expiry: remove from main store but keep in stale store
      expire(key) {
        store.delete(key);
      },
    };
  }
  return {
    appListCache: makeCache(),
    gameDetailCache: makeCache(),
    userProfileCache: makeCache(),
  };
}

describe('SteamClient', () => {
  let client;
  let cache;

  beforeEach(() => {
    cache = createMockCache();
    client = new SteamClient('test-api-key', cache);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchWithTimeout - timeout behavior', () => {
    it('throws TimeoutError when request is aborted', async () => {
      // Simulate fetch rejecting with AbortError when signal is aborted
      vi.stubGlobal('fetch', vi.fn((url, opts) => {
        return new Promise((resolve, reject) => {
          opts.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      }));

      // Use a very short timeout by temporarily patching
      // Instead, we test that AbortError gets translated to TimeoutError
      // by making the abort happen immediately
      vi.stubGlobal('fetch', vi.fn((url, opts) => {
        // Immediately abort to simulate timeout
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        return Promise.reject(err);
      }));

      await expect(client.searchStore('test')).rejects.toThrow(TimeoutError);
    });

    it('throws ApiError on non-2xx response', async () => {
      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal Server Error'),
        })
      ));

      await expect(client.searchStore('test')).rejects.toThrow(ApiError);
    });

    it('truncates error response body to 1024 chars', async () => {
      const longBody = 'x'.repeat(2000);
      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve(longBody),
        })
      ));

      try {
        await client.searchStore('test');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect(err.responseBody.length).toBe(1024);
      }
    });
  });

  describe('searchStore', () => {
    it('returns parsed JSON response on success', async () => {
      const mockData = { items: [{ id: 1, name: 'Test Game' }] };
      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockData),
        })
      ));

      const result = await client.searchStore('test game');
      expect(result).toEqual(mockData);
    });

    it('encodes search term in URL', async () => {
      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        })
      ));

      await client.searchStore('game with spaces');
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('term=game%20with%20spaces'),
        expect.any(Object)
      );
    });

    it('uses provided country code', async () => {
      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        })
      ));

      await client.searchStore('test', 'us');
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('cc=us'),
        expect.any(Object)
      );
    });
  });

  describe('getAppDetails', () => {
    it('returns cached value when available', async () => {
      const cachedData = { success: true, data: { name: 'Cached Game' } };
      cache.gameDetailCache.set('app:123:gb:', cachedData);

      const result = await client.getAppDetails(123);
      expect(result).toEqual(cachedData);
    });

    it('fetches and caches on cache miss', async () => {
      const mockData = { '123': { success: true, data: { name: 'New Game' } } };
      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockData),
        })
      ));

      const result = await client.getAppDetails(123);
      expect(result).toEqual(mockData);
      expect(cache.gameDetailCache.get('app:123:gb:')).toEqual(mockData);
    });

    it('includes filters in request URL', async () => {
      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        })
      ));

      await client.getAppDetails(123, 'gb', ['price_overview', 'genres']);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('filters=price_overview%2Cgenres'),
        expect.any(Object)
      );
    });

    it('serves stale cache on fetch failure', async () => {
      const staleCache = createStaleAwareCache();
      const staleClient = new SteamClient('key', staleCache);
      const staleData = { '123': { success: true, data: { name: 'Stale' } } };

      staleCache.gameDetailCache.set('app:123:gb:', staleData);
      staleCache.gameDetailCache.expire('app:123:gb:');

      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.reject(new Error('Network error'))
      ));

      const result = await staleClient.getAppDetails(123);
      expect(result).toEqual(staleData);
    });

    it('throws when fetch fails and no stale cache', async () => {
      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.reject(new Error('Network error'))
      ));

      await expect(client.getAppDetails(999)).rejects.toThrow('Network error');
    });
  });

  describe('getAppList', () => {
    it('returns cached app list when available', async () => {
      const cachedList = { applist: { apps: [{ appid: 1, name: 'Game' }] } };
      cache.appListCache.set('appList', cachedList);

      const result = await client.getAppList();
      expect(result).toEqual(cachedList);
    });

    it('fetches and caches app list on miss', async () => {
      const mockList = { applist: { apps: [{ appid: 1, name: 'Game' }] } };
      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockList),
        })
      ));

      const result = await client.getAppList();
      expect(result).toEqual(mockList);
      expect(cache.appListCache.get('appList')).toEqual(mockList);
    });

    it('serves stale cache on fetch failure', async () => {
      const staleCache = createStaleAwareCache();
      const staleClient = new SteamClient('key', staleCache);
      const staleList = { applist: { apps: [] } };

      staleCache.appListCache.set('appList', staleList);
      staleCache.appListCache.expire('appList');

      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.reject(new Error('Timeout'))
      ));

      const result = await staleClient.getAppList();
      expect(result).toEqual(staleList);
    });
  });

  describe('resolveVanityURL', () => {
    it('calls the correct endpoint with API key', async () => {
      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ response: { success: 1, steamid: '123' } }),
        })
      ));

      await client.resolveVanityURL('testuser');
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('key=test-api-key'),
        expect.any(Object)
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('vanityurl=testuser'),
        expect.any(Object)
      );
    });

    it('returns parsed JSON response', async () => {
      const mockResponse = { response: { success: 1, steamid: '76561198000000000' } };
      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockResponse),
        })
      ));

      const result = await client.resolveVanityURL('testuser');
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getPlayerSummaries', () => {
    it('returns cached value when available', async () => {
      const cachedData = { response: { players: [{ steamid: '123' }] } };
      cache.userProfileCache.set('players:123', cachedData);

      const result = await client.getPlayerSummaries('123');
      expect(result).toEqual(cachedData);
    });

    it('handles array of steam IDs', async () => {
      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ response: { players: [] } }),
        })
      ));

      await client.getPlayerSummaries(['123', '456']);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('steamids=123%2C456'),
        expect.any(Object)
      );
    });

    it('caches result after fetch', async () => {
      const mockData = { response: { players: [{ steamid: '123' }] } };
      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockData),
        })
      ));

      await client.getPlayerSummaries('123');
      expect(cache.userProfileCache.get('players:123')).toEqual(mockData);
    });

    it('serves stale cache on fetch failure', async () => {
      const staleCache = createStaleAwareCache();
      const staleClient = new SteamClient('key', staleCache);
      const staleData = { response: { players: [{ steamid: '123' }] } };

      staleCache.userProfileCache.set('players:123', staleData);
      staleCache.userProfileCache.expire('players:123');

      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.reject(new Error('Network error'))
      ));

      const result = await staleClient.getPlayerSummaries('123');
      expect(result).toEqual(staleData);
    });
  });

  describe('getOwnedGames', () => {
    it('returns cached value when available', async () => {
      const cachedData = { response: { game_count: 5 } };
      cache.userProfileCache.set('games:123', cachedData);

      const result = await client.getOwnedGames('123');
      expect(result).toEqual(cachedData);
    });

    it('fetches with correct parameters', async () => {
      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ response: { game_count: 10 } }),
        })
      ));

      await client.getOwnedGames('76561198000000000');
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('steamid=76561198000000000'),
        expect.any(Object)
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('include_played_free_games=1'),
        expect.any(Object)
      );
    });

    it('caches result after fetch', async () => {
      const mockData = { response: { game_count: 10 } };
      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockData),
        })
      ));

      await client.getOwnedGames('123');
      expect(cache.userProfileCache.get('games:123')).toEqual(mockData);
    });

    it('serves stale cache on fetch failure', async () => {
      const staleCache = createStaleAwareCache();
      const staleClient = new SteamClient('key', staleCache);
      const staleData = { response: { game_count: 5 } };

      staleCache.userProfileCache.set('games:123', staleData);
      staleCache.userProfileCache.expire('games:123');

      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.reject(new Error('Timeout'))
      ));

      const result = await staleClient.getOwnedGames('123');
      expect(result).toEqual(staleData);
    });
  });
});
