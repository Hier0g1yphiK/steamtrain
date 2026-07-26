/**
 * User Profile Service
 *
 * Fetches Steam user profile data (player summary + owned game count)
 * and maps it to the UserProfile data model.
 */

import { UserNotFoundError } from '../utils/errors.js';

/**
 * Maps Steam's personastate integer to a human-readable status string.
 */
const ONLINE_STATUS_MAP = {
  0: 'Offline',
  1: 'Online',
  2: 'Away',
  3: 'Away',
  4: 'Snooze',
  5: 'Looking to Trade',
  6: 'Looking to Play',
};

export class UserProfileService {
  /**
   * @param {import('../api/steamClient.js').SteamClient} steamClient
   */
  constructor(steamClient) {
    this.steamClient = steamClient;
  }

  /**
   * Fetch a user profile by SteamID64.
   *
   * Retrieves the player summary and, if the profile is public,
   * also fetches the owned game count.
   *
   * @param {string} steamId64 - The user's 64-bit Steam ID
   * @returns {Promise<object>} UserProfile data model
   * @throws {UserNotFoundError} If no player data is returned
   */
  async getProfile(steamId64) {
    const summaryResult = await this.steamClient.getPlayerSummaries(steamId64);

    const players = summaryResult?.response?.players;
    if (!players || players.length === 0) {
      throw new UserNotFoundError(
        `No Steam user found with ID "${steamId64}".`
      );
    }

    const player = players[0];
    const isPublic = player.communityvisibilitystate === 3;

    let gameCount = null;
    if (isPublic) {
      try {
        const gamesResult = await this.steamClient.getOwnedGames(steamId64);
        gameCount = gamesResult?.response?.game_count ?? null;
      } catch {
        // If fetching games fails, we still return the profile without game count
        gameCount = null;
      }
    }

    return {
      steamId64: player.steamid,
      personaName: player.personaname || '',
      avatarUrl: player.avatarfull || player.avatar || '',
      profileUrl: player.profileurl || '',
      onlineStatus: ONLINE_STATUS_MAP[player.personastate] || 'Offline',
      visibility: isPublic ? 'Public' : 'Private',
      country: isPublic ? (player.loccountrycode || null) : null,
      gameCount,
    };
  }
}
