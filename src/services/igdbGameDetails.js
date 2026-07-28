/**
 * IGDB Game Details Service
 * Fetches detailed game information from IGDB and maps it to a normalized model.
 */

import { GameNotFoundError } from '../utils/errors.js';

/**
 * Website category enum values from IGDB API.
 * Used to extract store links.
 */
const WEBSITE_CATEGORIES = {
  official: 1,
  steam: 13,
  epicgames: 16,
  gog: 17,
};

export class IgdbGameDetailsService {
  /**
   * @param {import('../api/igdbClient.js').IgdbClient} igdbClient
   */
  constructor(igdbClient) {
    this.igdbClient = igdbClient;
  }

  /**
   * Fetch game details by IGDB game ID.
   * @param {number} gameId - IGDB game ID
   * @returns {Promise<object>} Normalized game details
   * @throws {GameNotFoundError} If the game is not found
   */
  async getDetails(gameId) {
    const game = await this.igdbClient.getGameDetails(gameId);

    if (!game) {
      throw new GameNotFoundError(`Game with ID ${gameId} not found on IGDB`);
    }

    return mapToIgdbGameDetails(game);
  }
}

/**
 * Maps raw IGDB game data to a normalized details model.
 * @param {object} game - Raw IGDB API game object
 * @returns {object} Normalized game details
 */
export function mapToIgdbGameDetails(game) {
  const developers = (game.involved_companies || [])
    .filter((ic) => ic.developer)
    .map((ic) => ic.company?.name)
    .filter(Boolean);

  const publishers = (game.involved_companies || [])
    .filter((ic) => ic.publisher)
    .map((ic) => ic.company?.name)
    .filter(Boolean);

  const websites = game.websites || [];
  const storeLinks = extractStoreLinks(websites);

  const coverUrl = game.cover?.image_id
    ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.jpg`
    : '';

  const releaseDate = game.first_release_date
    ? new Date(game.first_release_date * 1000).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '';

  return {
    gameId: game.id,
    name: game.name || '',
    summary: truncate(game.summary || '', 300),
    coverUrl,
    genres: (game.genres || []).map((g) => g.name),
    platforms: (game.platforms || []).map((p) => p.name),
    themes: (game.themes || []).map((t) => t.name),
    developers,
    publishers,
    releaseDate,
    rating: game.total_rating ? Math.round(game.total_rating) : null,
    ratingCount: game.total_rating_count || 0,
    criticRating: game.aggregated_rating ? Math.round(game.aggregated_rating) : null,
    criticRatingCount: game.aggregated_rating_count || 0,
    igdbUrl: game.url || `https://www.igdb.com/games/${game.id}`,
    storeLinks,
    gameModes: (game.game_modes || []).map((m) => m.name),
    perspectives: (game.player_perspectives || []).map((p) => p.name),
  };
}

/**
 * Extracts store links from IGDB website data.
 * @param {Array} websites - IGDB websites array
 * @returns {object} Store links keyed by store name
 */
function extractStoreLinks(websites) {
  const links = {};

  for (const site of websites) {
    if (site.category === WEBSITE_CATEGORIES.steam) {
      links.steam = site.url;
    } else if (site.category === WEBSITE_CATEGORIES.epicgames) {
      links.epic = site.url;
    } else if (site.category === WEBSITE_CATEGORIES.gog) {
      links.gog = site.url;
    } else if (site.category === WEBSITE_CATEGORIES.official) {
      links.official = site.url;
    }
  }

  return links;
}

/**
 * Truncates a string to the specified max length with ellipsis.
 */
function truncate(str, maxLength) {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - 3) + '...';
}
