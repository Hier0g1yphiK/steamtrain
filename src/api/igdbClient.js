/**
 * IGDB API client with OAuth2 token management, timeout, and caching.
 *
 * Uses Twitch OAuth2 client credentials to authenticate with IGDB API v4.
 * Docs: https://api-docs.igdb.com/
 */

import { TimeoutError, ApiError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const TIMEOUT_MS = 10_000;
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const BASE_URL = 'https://api.igdb.com/v4';

/**
 * Performs a fetch with an AbortController timeout.
 */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new TimeoutError(`Request timed out after ${TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  return response;
}

export class IgdbClient {
  /**
   * @param {object} options
   * @param {string} options.clientId - Twitch/IGDB Client ID
   * @param {string} options.clientSecret - Twitch/IGDB Client Secret
   * @param {{ igdbCache: object }} options.cache - Cache instances
   */
  constructor({ clientId, clientSecret, cache }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.cache = cache;
    this.accessToken = null;
    this.tokenExpiresAt = 0;
  }

  /**
   * Obtain or refresh the OAuth2 access token using client credentials grant.
   * @returns {Promise<string>} Valid access token
   */
  async getAccessToken() {
    const now = Date.now();
    // Refresh token 60 seconds before expiry
    if (this.accessToken && now < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'client_credentials',
    });

    const response = await fetchWithTimeout(TOKEN_URL, {
      method: 'POST',
      body: params,
    });

    if (!response.ok) {
      throw new ApiError(
        `Twitch OAuth token request failed with status ${response.status}`,
        response.status,
        await response.text()
      );
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiresAt = now + data.expires_in * 1000;

    logger.info({ message: 'IGDB access token refreshed' });
    return this.accessToken;
  }

  /**
   * Make a request to an IGDB API endpoint.
   * @param {string} endpoint - e.g. 'games', 'covers'
   * @param {string} body - Apicalypse query body
   * @returns {Promise<Array>} Parsed JSON response
   */
  async query(endpoint, body) {
    const token = await this.getAccessToken();
    const url = `${BASE_URL}/${endpoint}`;

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Client-ID': this.clientId,
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
      body,
    });

    if (!response.ok) {
      let responseBody = '';
      try {
        responseBody = await response.text();
      } catch {
        // ignore read errors
      }
      if (responseBody.length > 1024) {
        responseBody = responseBody.slice(0, 1024);
      }
      throw new ApiError(
        `IGDB API returned ${response.status}`,
        response.status,
        responseBody
      );
    }

    return response.json();
  }

  /**
   * Search for games by name.
   * Returns game results with cover, genres, platforms, involved companies, and summary.
   * @param {string} name - Search term
   * @param {number} limit - Max results (default 10)
   * @returns {Promise<Array>} Game search results
   */
  async searchGames(name, limit = 10) {
    const body = [
      `search "${name.replace(/"/g, '\\"')}";`,
      'fields name,summary,cover.image_id,genres.name,platforms.name,',
      'involved_companies.company.name,involved_companies.developer,involved_companies.publisher,',
      'first_release_date,total_rating,total_rating_count,url,websites.category,websites.url;',
      `where version_parent = null;`,
      `limit ${limit};`,
    ].join('\n');

    return this.query('games', body);
  }

  /**
   * Get game details by ID.
   * @param {number} gameId - IGDB game ID
   * @returns {Promise<object|null>} Game details or null
   */
  async getGameDetails(gameId) {
    const cacheKey = `igdb:game:${gameId}`;
    const cached = this.cache.igdbCache.get(cacheKey, { allowStale: false });
    if (cached !== undefined) {
      return cached;
    }

    const body = [
      'fields name,summary,storyline,cover.image_id,',
      'genres.name,platforms.name,themes.name,',
      'involved_companies.company.name,involved_companies.developer,involved_companies.publisher,',
      'first_release_date,total_rating,total_rating_count,',
      'aggregated_rating,aggregated_rating_count,',
      'url,websites.category,websites.url,',
      'game_modes.name,player_perspectives.name;',
      `where id = ${Number(gameId)};`,
    ].join('\n');

    let result;
    try {
      const results = await this.query('games', body);
      result = results[0] || null;
    } catch (err) {
      const stale = this.cache.igdbCache.get(cacheKey, { allowStale: true });
      if (stale !== undefined) {
        logger.warn({
          message: 'Serving stale IGDB cache entry after fetch failure',
          cacheKey,
          error: err.message,
        });
        return stale;
      }
      throw err;
    }

    if (result) {
      this.cache.igdbCache.set(cacheKey, result);
    }
    return result;
  }
}
