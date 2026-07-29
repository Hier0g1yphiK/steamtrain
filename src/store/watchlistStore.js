/**
 * Watchlist Store
 * SQLite-backed persistence for server-level game watchlists.
 * Each guild has its own list of watched Steam app IDs and a notification channel.
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_DB_PATH = join(__dirname, '..', '..', 'data', 'watchlist.db');

/**
 * Initializes the SQLite database and creates tables if they don't exist.
 * @param {string} [dbPath] - Path to the SQLite database file
 * @returns {import('better-sqlite3').Database}
 */
export function initDatabase(dbPath = DEFAULT_DB_PATH) {
  // Ensure the data directory exists
  const dir = dirname(dbPath);
  mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      guild_id TEXT NOT NULL,
      app_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_known_price INTEGER,
      last_discount_percent INTEGER DEFAULT 0,
      PRIMARY KEY (guild_id, app_id)
    );

    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY,
      notification_channel_id TEXT
    );
  `);

  return db;
}

export class WatchlistStore {
  /**
   * @param {import('better-sqlite3').Database} db
   */
  constructor(db) {
    this.db = db;

    // Prepare statements for performance
    this._addGame = db.prepare(`
      INSERT OR IGNORE INTO watchlist (guild_id, app_id, name)
      VALUES (?, ?, ?)
    `);

    this._removeGame = db.prepare(`
      DELETE FROM watchlist WHERE guild_id = ? AND app_id = ?
    `);

    this._listGames = db.prepare(`
      SELECT app_id, name, added_at, last_known_price, last_discount_percent
      FROM watchlist WHERE guild_id = ?
      ORDER BY name ASC
    `);

    this._getGame = db.prepare(`
      SELECT app_id, name, added_at, last_known_price, last_discount_percent
      FROM watchlist WHERE guild_id = ? AND app_id = ?
    `);

    this._setChannel = db.prepare(`
      INSERT INTO guild_settings (guild_id, notification_channel_id)
      VALUES (?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET notification_channel_id = excluded.notification_channel_id
    `);

    this._getChannel = db.prepare(`
      SELECT notification_channel_id FROM guild_settings WHERE guild_id = ?
    `);

    this._getAllWatchedGames = db.prepare(`
      SELECT DISTINCT app_id, name FROM watchlist
    `);

    this._getGuildsWatchingApp = db.prepare(`
      SELECT guild_id, last_known_price, last_discount_percent
      FROM watchlist WHERE app_id = ?
    `);

    this._updatePrice = db.prepare(`
      UPDATE watchlist SET last_known_price = ?, last_discount_percent = ?
      WHERE guild_id = ? AND app_id = ?
    `);

    this._countGuildGames = db.prepare(`
      SELECT COUNT(*) as count FROM watchlist WHERE guild_id = ?
    `);
  }

  /**
   * Add a game to a guild's watchlist.
   * @param {string} guildId
   * @param {number} appId
   * @param {string} name
   * @returns {boolean} True if added, false if already existed
   */
  addGame(guildId, appId, name) {
    const result = this._addGame.run(guildId, appId, name);
    return result.changes > 0;
  }

  /**
   * Remove a game from a guild's watchlist.
   * @param {string} guildId
   * @param {number} appId
   * @returns {boolean} True if removed, false if not found
   */
  removeGame(guildId, appId) {
    const result = this._removeGame.run(guildId, appId);
    return result.changes > 0;
  }

  /**
   * List all games on a guild's watchlist.
   * @param {string} guildId
   * @returns {Array<{ app_id: number, name: string, added_at: string, last_known_price: number|null, last_discount_percent: number }>}
   */
  listGames(guildId) {
    return this._listGames.all(guildId);
  }

  /**
   * Get a specific game from a guild's watchlist.
   * @param {string} guildId
   * @param {number} appId
   * @returns {object|undefined}
   */
  getGame(guildId, appId) {
    return this._getGame.get(guildId, appId);
  }

  /**
   * Set the notification channel for a guild.
   * @param {string} guildId
   * @param {string} channelId
   */
  setNotificationChannel(guildId, channelId) {
    this._setChannel.run(guildId, channelId);
  }

  /**
   * Get the notification channel for a guild.
   * @param {string} guildId
   * @returns {string|null}
   */
  getNotificationChannel(guildId) {
    const row = this._getChannel.get(guildId);
    return row?.notification_channel_id || null;
  }

  /**
   * Get all distinct watched games across all guilds.
   * @returns {Array<{ app_id: number, name: string }>}
   */
  getAllWatchedGames() {
    return this._getAllWatchedGames.all();
  }

  /**
   * Get all guilds watching a specific app.
   * @param {number} appId
   * @returns {Array<{ guild_id: string, last_known_price: number|null, last_discount_percent: number }>}
   */
  getGuildsWatchingApp(appId) {
    return this._getGuildsWatchingApp.all(appId);
  }

  /**
   * Update the stored price for a game in a guild's watchlist.
   * @param {string} guildId
   * @param {number} appId
   * @param {number} price - Current price in pence
   * @param {number} discountPercent
   */
  updatePrice(guildId, appId, price, discountPercent) {
    this._updatePrice.run(price, discountPercent, guildId, appId);
  }

  /**
   * Get the count of games on a guild's watchlist.
   * @param {string} guildId
   * @returns {number}
   */
  countGuildGames(guildId) {
    const row = this._countGuildGames.get(guildId);
    return row?.count || 0;
  }

  /**
   * Close the database connection.
   */
  close() {
    this.db.close();
  }
}
