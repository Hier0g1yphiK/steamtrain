import { describe, it, expect, vi } from 'vitest';
import { GameSearchService, stringSimilarity, applyThresholdRouting } from './gameSearch.js';

describe('stringSimilarity', () => {
  it('returns 100 for identical strings', () => {
    expect(stringSimilarity('Portal 2', 'Portal 2')).toBe(100);
  });

  it('returns 100 for case-insensitive matches', () => {
    expect(stringSimilarity('portal 2', 'Portal 2')).toBe(100);
  });

  it('returns 0 when one string is empty', () => {
    expect(stringSimilarity('', 'Portal')).toBe(0);
    expect(stringSimilarity('Portal', '')).toBe(0);
  });

  it('returns a high score for very similar strings', () => {
    const score = stringSimilarity('Portal', 'Portal 2');
    expect(score).toBeGreaterThan(60);
  });

  it('returns a low score for dissimilar strings', () => {
    const score = stringSimilarity('Portal', 'Civilization VI');
    expect(score).toBeLessThan(40);
  });
});

describe('applyThresholdRouting', () => {
  it('returns no matches for empty results', () => {
    expect(applyThresholdRouting([])).toEqual({ match: null, candidates: [] });
    expect(applyThresholdRouting(null)).toEqual({ match: null, candidates: [] });
  });

  it('auto-selects single result with ≥ 90% similarity', () => {
    const results = [
      { appId: 400, name: 'Portal', similarity: 95 },
      { appId: 500, name: 'Portal 2', similarity: 50 },
    ];
    const { match, candidates } = applyThresholdRouting(results);
    expect(match).toEqual({ appId: 400, name: 'Portal', similarity: 95 });
    expect(candidates).toEqual([]);
  });

  it('returns candidates when 2+ results > 60%', () => {
    const results = [
      { appId: 400, name: 'Portal', similarity: 85 },
      { appId: 500, name: 'Portal 2', similarity: 80 },
      { appId: 600, name: 'Portal Stories', similarity: 70 },
    ];
    const { match, candidates } = applyThresholdRouting(results);
    expect(match).toBeNull();
    expect(candidates).toHaveLength(3);
    expect(candidates[0].similarity).toBeGreaterThanOrEqual(candidates[1].similarity);
  });

  it('limits candidates to top 5', () => {
    const results = Array.from({ length: 10 }, (_, i) => ({
      appId: i,
      name: `Game ${i}`,
      similarity: 65 + i,
    }));
    const { candidates } = applyThresholdRouting(results);
    expect(candidates).toHaveLength(5);
  });

  it('returns no matches when no results exceed 60%', () => {
    const results = [
      { appId: 1, name: 'Game A', similarity: 40 },
      { appId: 2, name: 'Game B', similarity: 30 },
    ];
    const { match, candidates } = applyThresholdRouting(results);
    expect(match).toBeNull();
    expect(candidates).toEqual([]);
  });

  it('does NOT auto-select when multiple results have ≥ 90%', () => {
    const results = [
      { appId: 1, name: 'Portal', similarity: 95 },
      { appId: 2, name: 'Portal', similarity: 92 },
    ];
    const { match, candidates } = applyThresholdRouting(results);
    // Multiple high matches → treat as candidates, not auto-select
    expect(match).toBeNull();
    expect(candidates).toHaveLength(2);
  });
});

describe('GameSearchService', () => {
  function createMockSteamClient({ searchStoreResult, searchStoreError, appListResult } = {}) {
    return {
      searchStore: searchStoreError
        ? vi.fn().mockRejectedValue(searchStoreError)
        : vi.fn().mockResolvedValue(searchStoreResult || { items: [] }),
      getAppList: vi.fn().mockResolvedValue(appListResult || { applist: { apps: [] } }),
    };
  }

  it('uses storefront search results and computes similarity', async () => {
    const client = createMockSteamClient({
      searchStoreResult: {
        items: [
          { id: 400, name: 'Portal' },
          { id: 620, name: 'Portal 2' },
        ],
      },
    });

    const service = new GameSearchService(client);
    const result = await service.search('Portal');

    expect(client.searchStore).toHaveBeenCalledWith('Portal');
    expect(result.match).not.toBeNull();
    expect(result.match.name).toBe('Portal');
    expect(result.match.similarity).toBe(100);
  });

  it('falls back to app list when storefront search fails', async () => {
    const client = createMockSteamClient({
      searchStoreError: new Error('Network failure'),
      appListResult: {
        applist: {
          apps: [
            { appid: 400, name: 'Portal' },
            { appid: 620, name: 'Portal 2' },
            { appid: 999, name: 'Totally Unrelated Game' },
          ],
        },
      },
    });

    const service = new GameSearchService(client);
    const result = await service.search('Portal');

    expect(client.searchStore).toHaveBeenCalled();
    expect(client.getAppList).toHaveBeenCalled();
    // Should find Portal with high similarity
    expect(result.match).not.toBeNull();
    expect(result.match.name).toBe('Portal');
  });

  it('returns no matches when nothing is similar', async () => {
    const client = createMockSteamClient({
      searchStoreResult: {
        items: [
          { id: 1, name: 'Completely Different Game Title That Has Nothing In Common' },
        ],
      },
    });

    const service = new GameSearchService(client);
    const result = await service.search('xyz');

    expect(result.match).toBeNull();
    expect(result.candidates).toEqual([]);
  });
});
