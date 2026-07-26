/**
 * Game search service with storefront search and fuzzy matching fallback.
 */

import { logger } from '../utils/logger.js';

/**
 * Compute normalized string similarity between two strings using
 * a case-insensitive Levenshtein distance approach.
 * Returns a score from 0 to 100.
 */
export function stringSimilarity(a, b) {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();

  if (s1 === s2) return 100;
  if (s1.length === 0 || s2.length === 0) return 0;

  const maxLen = Math.max(s1.length, s2.length);
  const distance = levenshtein(s1, s2);
  return Math.round((1 - distance / maxLen) * 100);
}

/**
 * Compute Levenshtein distance between two strings.
 */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;

  // Use a single-row DP approach for space efficiency
  const prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = prev[j];
      if (a[i - 1] === b[j - 1]) {
        prev[j] = prevDiag;
      } else {
        prev[j] = 1 + Math.min(prevDiag, prev[j], prev[j - 1]);
      }
      prevDiag = temp;
    }
  }

  return prev[n];
}

/**
 * Apply threshold routing to a list of scored results.
 * Returns { match: GameResult | null, candidates: GameResult[] }
 */
export function applyThresholdRouting(results) {
  if (!results || results.length === 0) {
    return { match: null, candidates: [] };
  }

  // Sort by similarity descending
  const sorted = [...results].sort((a, b) => b.similarity - a.similarity);

  // Check for single result with ≥ 90% similarity
  const highMatches = sorted.filter(r => r.similarity >= 90);
  if (highMatches.length === 1) {
    return { match: highMatches[0], candidates: [] };
  }

  // Check for 2+ results > 60%
  const aboveThreshold = sorted.filter(r => r.similarity > 60);
  if (aboveThreshold.length >= 2) {
    return { match: null, candidates: aboveThreshold.slice(0, 5) };
  }

  // If exactly one result > 60% but < 90%, it's still a candidate
  // but doesn't meet auto-select criteria — treat as single candidate
  if (aboveThreshold.length === 1) {
    return { match: null, candidates: aboveThreshold };
  }

  // No results above 60%
  return { match: null, candidates: [] };
}

export class GameSearchService {
  /**
   * @param {import('../api/steamClient.js').SteamClient} steamClient
   */
  constructor(steamClient) {
    this.steamClient = steamClient;
  }

  /**
   * Search for a game by name.
   * Returns { match: GameResult | null, candidates: GameResult[] }
   */
  async search(name) {
    let results;

    try {
      results = await this._searchStorefront(name);
    } catch (err) {
      logger.warn({
        message: 'Storefront search failed, falling back to app list fuzzy match',
        error: err.message,
      });
      results = await this._fuzzyMatchAppList(name);
    }

    return applyThresholdRouting(results);
  }

  /**
   * Query the storefront search endpoint and compute similarity scores.
   */
  async _searchStorefront(name) {
    const response = await this.steamClient.searchStore(name);
    const items = response?.items || [];

    return items.map(item => ({
      appId: item.id,
      name: item.name,
      similarity: stringSimilarity(name, item.name),
    }));
  }

  /**
   * Fall back to fuzzy matching against the cached full app list.
   */
  async _fuzzyMatchAppList(name) {
    const response = await this.steamClient.getAppList();
    const apps = response?.applist?.apps || [];

    // Score all apps and filter to those with meaningful similarity
    const scored = [];
    for (const app of apps) {
      if (!app.name) continue;
      const similarity = stringSimilarity(name, app.name);
      if (similarity > 40) {
        scored.push({
          appId: app.appid,
          name: app.name,
          similarity,
        });
      }
    }

    // Sort by similarity descending and take top results
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, 20);
  }
}
