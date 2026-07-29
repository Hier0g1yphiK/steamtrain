/**
 * Sale Checker Service
 * Periodically polls Steam for price changes on watched games
 * and sends notifications to configured guild channels.
 */

import { logger } from '../utils/logger.js';
import { buildSaleEmbed } from '../embeds/saleEmbed.js';

const POLL_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours
const BATCH_DELAY_MS = 2000; // 2 seconds between API calls to avoid rate limits

export class SaleCheckerService {
  /**
   * @param {object} options
   * @param {import('../store/watchlistStore.js').WatchlistStore} options.watchlistStore
   * @param {import('../api/steamClient.js').SteamClient} options.steamClient
   * @param {import('discord.js').Client} options.discordClient
   */
  constructor({ watchlistStore, steamClient, discordClient }) {
    this.watchlistStore = watchlistStore;
    this.steamClient = steamClient;
    this.discordClient = discordClient;
    this._intervalId = null;
    this._batchDelayMs = BATCH_DELAY_MS;
  }

  /**
   * Start the periodic price check loop.
   */
  start() {
    logger.info({ message: 'Sale checker started, polling every 2 hours' });

    // Run once immediately on startup, then on interval
    this._check();
    this._intervalId = setInterval(() => this._check(), POLL_INTERVAL_MS);
  }

  /**
   * Stop the periodic price check loop.
   */
  stop() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
      logger.info({ message: 'Sale checker stopped' });
    }
  }

  /**
   * Run a single price check cycle across all watched games.
   */
  async _check() {
    const watchedGames = this.watchlistStore.getAllWatchedGames();

    if (watchedGames.length === 0) {
      logger.info({ message: 'No games on any watchlist, skipping price check' });
      return;
    }

    logger.info({ message: `Checking prices for ${watchedGames.length} watched game(s)` });

    for (const game of watchedGames) {
      try {
        await this._checkGame(game);
      } catch (error) {
        logger.error({
          message: 'Failed to check price for game',
          appId: game.app_id,
          name: game.name,
          error: error.message,
        });
      }

      // Rate limit: wait between API calls
      await sleep(this._batchDelayMs);
    }
  }

  /**
   * Check a single game's current price and notify guilds if on sale.
   * @param {{ app_id: number, name: string }} game
   */
  async _checkGame(game) {
    const appId = game.app_id;

    // Fetch current price from Steam
    const result = await this.steamClient.getAppDetails(appId, 'gb', ['price_overview', 'basic']);
    const appData = result[String(appId)];

    if (!appData || !appData.success || !appData.data) {
      return;
    }

    const data = appData.data;
    const priceOverview = data.price_overview;

    // Skip free-to-play games or games without price info
    if (data.is_free || !priceOverview) {
      return;
    }

    const currentPrice = priceOverview.final;
    const originalPrice = priceOverview.initial;
    const discountPercent = priceOverview.discount_percent || 0;
    const gameName = data.name || game.name;

    // Get all guilds watching this game
    const guilds = this.watchlistStore.getGuildsWatchingApp(appId);

    for (const guild of guilds) {
      const previousDiscount = guild.last_discount_percent || 0;

      // Notify if there's a new discount that wasn't there before,
      // or if the discount has increased
      const isNewSale = discountPercent > 0 && discountPercent > previousDiscount;

      if (isNewSale) {
        await this._notifyGuild(guild.guild_id, {
          appId,
          name: gameName,
          currentPrice,
          originalPrice,
          discountPercent,
        });
      }

      // Always update stored price/discount so we track state
      this.watchlistStore.updatePrice(guild.guild_id, appId, currentPrice, discountPercent);
    }
  }

  /**
   * Send a sale notification to a guild's configured channel.
   * @param {string} guildId
   * @param {object} saleInfo
   */
  async _notifyGuild(guildId, saleInfo) {
    const channelId = this.watchlistStore.getNotificationChannel(guildId);

    if (!channelId) {
      logger.warn({
        message: 'No notification channel set for guild, skipping notification',
        guildId,
        game: saleInfo.name,
      });
      return;
    }

    try {
      const channel = await this.discordClient.channels.fetch(channelId);

      if (!channel || !channel.isTextBased()) {
        logger.warn({
          message: 'Notification channel is not text-based or not found',
          guildId,
          channelId,
        });
        return;
      }

      const embed = buildSaleEmbed(saleInfo);
      await channel.send({ embeds: [embed] });

      logger.info({
        message: 'Sale notification sent',
        guildId,
        game: saleInfo.name,
        discount: saleInfo.discountPercent,
      });
    } catch (error) {
      logger.error({
        message: 'Failed to send sale notification',
        guildId,
        channelId,
        error: error.message,
      });
    }
  }
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
