/**
 * IGDB Game Search Service
 * Searches IGDB for games and applies threshold routing for match confidence.
 */

import { stringSimilarity, applyThresholdRouting } from './gameSearch.js';

export class IgdbGameSearchService {
  /**
   * @param {import('../api/igdbClient.js').IgdbClient} igdbClient
   */
  constructor(igdbClient) {
    this.igdbClient = igdbClient;
  }

  /**
   * Search for a game by name via IGDB.
   * Returns { match: GameResult | null, candidates: GameResult[] }
   * @param {string} name - Search term
   * @returns {Promise<{ match: object|null, candidates: Array }>}
   */
  async search(name) {
    const results = await this.igdbClient.searchGames(name, 10);

    const scored = results.map((game) => ({
      gameId: game.id,
      name: game.name,
      similarity: stringSimilarity(name, game.name),
      // Carry along extra data for the embed if we get a direct match
      _raw: game,
    }));

    return applyThresholdRouting(scored);
  }
}
