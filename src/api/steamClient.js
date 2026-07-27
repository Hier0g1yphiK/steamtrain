/**
 * Steam API client with timeout, error handling, caching, and stale-while-revalidate.
 */

import { TimeoutError, ApiError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const TIMEOUT_MS = 10_000;

/**
 * Performs a fetch with an AbortController timeout.
 * Throws TimeoutError on abort, ApiError on non-2xx responses.
 */
async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new TimeoutError(`Request timed out after ${TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let body = '';
    try {
      body = await response.text();
    } catch {
      // ignore read errors
    }
    if (body.length > 1024) {
      body = body.slice(0, 1024);
    }
    throw new ApiError(
      `Steam API returned ${response.status}`,
      response.status,
      body
    );
  }

  return response;
}

export class SteamClient {
  /**
   * @param {string} apiKey - Steam Web API key
   * @param {{ appListCache: object, gameDetailCache: object, userProfileCache: object }} cache - Cache instances
   */
  constructor(apiKey, cache) {
    this.apiKey = apiKey;
    this.cache = cache;
  }

  /**
   * Search the Steam store by term.
   * No API key required.
   * @param {string} term - Search term
   * @param {string} cc - Country code (default 'gb')
   * @returns {Promise<object>} Search results
   */
  async searchStore(term, cc = 'gb') {
    const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&cc=${encodeURIComponent(cc)}&l=english`;
    const response = await fetchWithTimeout(url);
    return response.json();
  }

  /**
   * Get app details from the Steam store.
   * No API key required.
   * @param {number|string} appId - Steam app ID
   * @param {string} cc - Country code (default 'gb')
   * @param {string[]} filters - API filters
   * @returns {Promise<object>} App details
   */
  async getAppDetails(appId, cc = 'gb', filters = []) {
    const cacheKey = `app:${appId}:${cc}:${filters.join(',')}`;
    const cached = this.cache.gameDetailCache.get(cacheKey, { allowStale: false });
    if (cached !== undefined) {
      return cached;
    }

    const params = new URLSearchParams({
      appids: String(appId),
      cc,
    });
    if (filters.length > 0) {
      params.set('filters', filters.join(','));
    }

    const url = `https://store.steampowered.com/api/appdetails?${params}`;

    let result;
    try {
      const response = await fetchWithTimeout(url);
      result = await response.json();
    } catch (err) {
      // Stale-while-revalidate: serve expired cache entry if available
      const stale = this.cache.gameDetailCache.get(cacheKey, { allowStale: true });
      if (stale !== undefined) {
        logger.warn({
          message: 'Serving stale cache entry after fetch failure',
          cacheKey,
          error: err.message,
        });
        return stale;
      }
      throw err;
    }

    this.cache.gameDetailCache.set(cacheKey, result);
    return result;
  }

  /**
   * Get the full Steam app list.
   * Requires API key (uses IStoreService).
   * @returns {Promise<object>} App list in the format { applist: { apps: [{ appid, name }] } }
   */
  async getAppList() {
    const cacheKey = 'appList';
    const cached = this.cache.appListCache.get(cacheKey, { allowStale: false });
    if (cached !== undefined) {
      return cached;
    }

    let apps;
    try {
      apps = [];
      let lastAppId = 0;
      let hasMore = true;

      while (hasMore) {
        const params = new URLSearchParams({
          key: this.apiKey,
          max_results: '50000',
        });
        if (lastAppId > 0) {
          params.set('last_appid', String(lastAppId));
        }

        const url = `https://api.steampowered.com/IStoreService/GetAppList/v1/?${params}`;
        const response = await fetchWithTimeout(url);
        const data = await response.json();

        const pageApps = data?.response?.apps || [];
        if (pageApps.length === 0) {
          hasMore = false;
        } else {
          for (const app of pageApps) {
            apps.push({ appid: app.appid, name: app.name });
          }
          lastAppId = pageApps[pageApps.length - 1].appid;
          hasMore = data?.response?.have_more_results === true;
        }
      }
    } catch (err) {
      // Stale-while-revalidate
      const stale = this.cache.appListCache.get(cacheKey, { allowStale: true });
      if (stale !== undefined) {
        logger.warn({
          message: 'Serving stale cache entry after fetch failure',
          cacheKey,
          error: err.message,
        });
        return stale;
      }
      throw err;
    }

    const result = { applist: { apps } };
    this.cache.appListCache.set(cacheKey, result);
    return result;
  }

  /**
   * Resolve a vanity URL to a SteamID64.
   * Requires API key.
   * @param {string} vanityName - Vanity URL name
   * @returns {Promise<object>} Resolution result
   */
  async resolveVanityURL(vanityName) {
    const url = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${encodeURIComponent(this.apiKey)}&vanityurl=${encodeURIComponent(vanityName)}`;
    const response = await fetchWithTimeout(url);
    return response.json();
  }

  /**
   * Get player summaries for one or more Steam IDs.
   * Requires API key.
   * @param {string|string[]} steamIds - One or more SteamID64s
   * @returns {Promise<object>} Player summaries
   */
  async getPlayerSummaries(steamIds) {
    const ids = Array.isArray(steamIds) ? steamIds.join(',') : steamIds;
    const cacheKey = `players:${ids}`;
    const cached = this.cache.userProfileCache.get(cacheKey, { allowStale: false });
    if (cached !== undefined) {
      return cached;
    }

    const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(this.apiKey)}&steamids=${encodeURIComponent(ids)}`;

    let result;
    try {
      const response = await fetchWithTimeout(url);
      result = await response.json();
    } catch (err) {
      // Stale-while-revalidate
      const stale = this.cache.userProfileCache.get(cacheKey, { allowStale: true });
      if (stale !== undefined) {
        logger.warn({
          message: 'Serving stale cache entry after fetch failure',
          cacheKey,
          error: err.message,
        });
        return stale;
      }
      throw err;
    }

    this.cache.userProfileCache.set(cacheKey, result);
    return result;
  }

  /**
   * Get owned games for a Steam user.
   * Requires API key.
   * @param {string} steamId - SteamID64
   * @returns {Promise<object>} Owned games data
   */
  async getOwnedGames(steamId) {
    const cacheKey = `games:${steamId}`;
    const cached = this.cache.userProfileCache.get(cacheKey, { allowStale: false });
    if (cached !== undefined) {
      return cached;
    }

    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(this.apiKey)}&steamid=${encodeURIComponent(steamId)}&include_played_free_games=1`;

    let result;
    try {
      const response = await fetchWithTimeout(url);
      result = await response.json();
    } catch (err) {
      // Stale-while-revalidate
      const stale = this.cache.userProfileCache.get(cacheKey, { allowStale: true });
      if (stale !== undefined) {
        logger.warn({
          message: 'Serving stale cache entry after fetch failure',
          cacheKey,
          error: err.message,
        });
        return stale;
      }
      throw err;
    }

    this.cache.userProfileCache.set(cacheKey, result);
    return result;
  }
}
