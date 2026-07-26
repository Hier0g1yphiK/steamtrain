/**
 * User Resolve Service
 *
 * Resolves user input (profile URL, vanity URL, SteamID64, vanity name)
 * to a SteamID64 using a defined resolution order.
 */

import { UserNotFoundError, InvalidInputError } from '../utils/errors.js';

// Matches https://steamcommunity.com/profiles/<digits>
const PROFILE_URL_REGEX = /^https?:\/\/steamcommunity\.com\/profiles\/(\d+)\/?$/;

// Matches https://steamcommunity.com/id/<name>
const VANITY_URL_REGEX = /^https?:\/\/steamcommunity\.com\/id\/([^/]+)\/?$/;

// Matches a raw 17-digit SteamID64
const STEAMID64_REGEX = /^\d{17}$/;

export class UserResolveService {
  /**
   * @param {import('../api/steamClient.js').SteamClient} steamClient
   */
  constructor(steamClient) {
    this.steamClient = steamClient;
  }

  /**
   * Resolve a user query to a SteamID64.
   *
   * Resolution order:
   * 1. Profile URL (https://steamcommunity.com/profiles/<digits>) → extract SteamID64
   * 2. Vanity URL (https://steamcommunity.com/id/<name>) → resolve via vanity API
   * 3. 17-digit numeric string → use directly as SteamID64
   * 4. Otherwise → treat as vanity name and resolve via vanity API
   *
   * @param {string} query - User input to resolve
   * @returns {Promise<{ steamId64: string }>}
   * @throws {UserNotFoundError} If vanity resolution fails
   * @throws {InvalidInputError} If input is empty or invalid
   */
  async resolve(query) {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new InvalidInputError(
        'Please provide a Steam profile URL, vanity name, or SteamID64.'
      );
    }

    const trimmed = query.trim();

    // 1. Check for profile URL: https://steamcommunity.com/profiles/<digits>
    const profileMatch = trimmed.match(PROFILE_URL_REGEX);
    if (profileMatch) {
      return { steamId64: profileMatch[1] };
    }

    // 2. Check for vanity URL: https://steamcommunity.com/id/<name>
    const vanityUrlMatch = trimmed.match(VANITY_URL_REGEX);
    if (vanityUrlMatch) {
      return this._resolveVanity(vanityUrlMatch[1]);
    }

    // 3. Check for raw 17-digit SteamID64
    if (STEAMID64_REGEX.test(trimmed)) {
      return { steamId64: trimmed };
    }

    // 4. Treat as vanity name
    return this._resolveVanity(trimmed);
  }

  /**
   * Resolve a vanity name to a SteamID64 via the Steam API.
   *
   * @param {string} vanityName
   * @returns {Promise<{ steamId64: string }>}
   * @throws {UserNotFoundError} If resolution fails (success !== 1)
   */
  async _resolveVanity(vanityName) {
    const result = await this.steamClient.resolveVanityURL(vanityName);

    if (result?.response?.success !== 1) {
      throw new UserNotFoundError(
        `Could not find a Steam user with the name "${vanityName}". Please check the spelling or try a profile URL.`
      );
    }

    return { steamId64: result.response.steamid };
  }
}
