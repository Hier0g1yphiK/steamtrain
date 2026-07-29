/**
 * Unit tests for WatchlistStore
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDatabase, WatchlistStore } from './watchlistStore.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';

describe('WatchlistStore', () => {
  let store;
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'watchlist-test-'));
    const dbPath = join(tmpDir, 'test.db');
    const db = initDatabase(dbPath);
    store = new WatchlistStore(db);
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('addGame', () => {
    it('adds a game and returns true', () => {
      const result = store.addGame('guild1', 730, 'Counter-Strike 2');
      expect(result).toBe(true);
    });

    it('returns false if the game is already on the watchlist', () => {
      store.addGame('guild1', 730, 'Counter-Strike 2');
      const result = store.addGame('guild1', 730, 'Counter-Strike 2');
      expect(result).toBe(false);
    });

    it('allows the same game in different guilds', () => {
      expect(store.addGame('guild1', 730, 'Counter-Strike 2')).toBe(true);
      expect(store.addGame('guild2', 730, 'Counter-Strike 2')).toBe(true);
    });
  });

  describe('removeGame', () => {
    it('removes a game and returns true', () => {
      store.addGame('guild1', 730, 'Counter-Strike 2');
      const result = store.removeGame('guild1', 730);
      expect(result).toBe(true);
    });

    it('returns false if the game was not on the watchlist', () => {
      const result = store.removeGame('guild1', 999);
      expect(result).toBe(false);
    });
  });

  describe('listGames', () => {
    it('returns an empty array for a guild with no games', () => {
      expect(store.listGames('guild1')).toEqual([]);
    });

    it('returns all games for a guild sorted by name', () => {
      store.addGame('guild1', 730, 'Counter-Strike 2');
      store.addGame('guild1', 570, 'Dota 2');
      store.addGame('guild1', 440, 'Team Fortress 2');

      const games = store.listGames('guild1');
      expect(games).toHaveLength(3);
      expect(games[0].name).toBe('Counter-Strike 2');
      expect(games[1].name).toBe('Dota 2');
      expect(games[2].name).toBe('Team Fortress 2');
    });

    it('does not include games from other guilds', () => {
      store.addGame('guild1', 730, 'Counter-Strike 2');
      store.addGame('guild2', 570, 'Dota 2');

      const games = store.listGames('guild1');
      expect(games).toHaveLength(1);
      expect(games[0].app_id).toBe(730);
    });
  });

  describe('getGame', () => {
    it('returns the game if it exists', () => {
      store.addGame('guild1', 730, 'Counter-Strike 2');
      const game = store.getGame('guild1', 730);
      expect(game).toBeDefined();
      expect(game.app_id).toBe(730);
      expect(game.name).toBe('Counter-Strike 2');
    });

    it('returns undefined if the game does not exist', () => {
      expect(store.getGame('guild1', 999)).toBeUndefined();
    });
  });

  describe('notification channel', () => {
    it('returns null if no channel is set', () => {
      expect(store.getNotificationChannel('guild1')).toBeNull();
    });

    it('stores and retrieves the notification channel', () => {
      store.setNotificationChannel('guild1', 'channel123');
      expect(store.getNotificationChannel('guild1')).toBe('channel123');
    });

    it('updates the channel if already set', () => {
      store.setNotificationChannel('guild1', 'channel123');
      store.setNotificationChannel('guild1', 'channel456');
      expect(store.getNotificationChannel('guild1')).toBe('channel456');
    });
  });

  describe('getAllWatchedGames', () => {
    it('returns distinct games across all guilds', () => {
      store.addGame('guild1', 730, 'Counter-Strike 2');
      store.addGame('guild2', 730, 'Counter-Strike 2');
      store.addGame('guild1', 570, 'Dota 2');

      const games = store.getAllWatchedGames();
      expect(games).toHaveLength(2);
      const appIds = games.map((g) => g.app_id);
      expect(appIds).toContain(730);
      expect(appIds).toContain(570);
    });
  });

  describe('getGuildsWatchingApp', () => {
    it('returns all guilds watching a specific app', () => {
      store.addGame('guild1', 730, 'Counter-Strike 2');
      store.addGame('guild2', 730, 'Counter-Strike 2');
      store.addGame('guild3', 570, 'Dota 2');

      const guilds = store.getGuildsWatchingApp(730);
      expect(guilds).toHaveLength(2);
      const guildIds = guilds.map((g) => g.guild_id);
      expect(guildIds).toContain('guild1');
      expect(guildIds).toContain('guild2');
    });
  });

  describe('updatePrice', () => {
    it('updates the price and discount for a game', () => {
      store.addGame('guild1', 730, 'Counter-Strike 2');
      store.updatePrice('guild1', 730, 1499, 25);

      const game = store.getGame('guild1', 730);
      expect(game.last_known_price).toBe(1499);
      expect(game.last_discount_percent).toBe(25);
    });
  });

  describe('countGuildGames', () => {
    it('returns 0 for empty watchlist', () => {
      expect(store.countGuildGames('guild1')).toBe(0);
    });

    it('returns the correct count', () => {
      store.addGame('guild1', 730, 'Counter-Strike 2');
      store.addGame('guild1', 570, 'Dota 2');
      expect(store.countGuildGames('guild1')).toBe(2);
    });
  });
});
