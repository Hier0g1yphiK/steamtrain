/**
 * Unit tests for /watchlist command
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execute, command } from './watchlist.js';

describe('watchlist command', () => {
  let interaction;
  let deps;
  let mockWatchlistStore;
  let mockGameSearchService;

  beforeEach(() => {
    mockWatchlistStore = {
      addGame: vi.fn().mockReturnValue(true),
      removeGame: vi.fn().mockReturnValue(true),
      listGames: vi.fn().mockReturnValue([]),
      countGuildGames: vi.fn().mockReturnValue(0),
      setNotificationChannel: vi.fn(),
      getNotificationChannel: vi.fn().mockReturnValue(null),
    };

    mockGameSearchService = {
      search: vi.fn().mockResolvedValue({ match: null, candidates: [] }),
    };

    deps = {
      watchlistStore: mockWatchlistStore,
      gameSearchService: mockGameSearchService,
    };

    interaction = {
      guildId: 'guild123',
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue({ awaitMessageComponent: vi.fn() }),
      options: {
        getSubcommand: vi.fn().mockReturnValue('list'),
        getString: vi.fn().mockReturnValue('Counter-Strike 2'),
        getChannel: vi.fn().mockReturnValue({ id: 'ch123', isTextBased: () => true }),
      },
      memberPermissions: {
        has: vi.fn().mockReturnValue(true),
      },
    };
  });

  describe('command metadata', () => {
    it('has the correct name', () => {
      expect(command.name).toBe('watchlist');
    });

    it('has a description under 100 characters', () => {
      expect(command.description.length).toBeLessThanOrEqual(100);
    });

    it('has subcommand options', () => {
      expect(command.options).toHaveLength(4);
      const names = command.options.map((o) => o.name);
      expect(names).toContain('add');
      expect(names).toContain('remove');
      expect(names).toContain('list');
      expect(names).toContain('channel');
    });
  });

  describe('execute — add subcommand', () => {
    beforeEach(() => {
      interaction.options.getSubcommand.mockReturnValue('add');
    });

    it('defers the reply', async () => {
      mockGameSearchService.search.mockResolvedValue({
        match: { appId: 730, name: 'Counter-Strike 2', similarity: 95 },
        candidates: [],
      });
      await execute(interaction, deps);
      expect(interaction.deferReply).toHaveBeenCalled();
    });

    it('adds a game on high-confidence match', async () => {
      mockGameSearchService.search.mockResolvedValue({
        match: { appId: 730, name: 'Counter-Strike 2', similarity: 95 },
        candidates: [],
      });

      await execute(interaction, deps);

      expect(mockWatchlistStore.addGame).toHaveBeenCalledWith('guild123', 730, 'Counter-Strike 2');
      expect(interaction.editReply).toHaveBeenCalledWith({
        content: '✅ **Counter-Strike 2** has been added to the sale watchlist.',
      });
    });

    it('reports if game is already on the watchlist', async () => {
      mockGameSearchService.search.mockResolvedValue({
        match: { appId: 730, name: 'Counter-Strike 2', similarity: 95 },
        candidates: [],
      });
      mockWatchlistStore.addGame.mockReturnValue(false);

      await execute(interaction, deps);

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: '**Counter-Strike 2** is already on the watchlist.',
      });
    });

    it('rejects when watchlist is full', async () => {
      mockWatchlistStore.countGuildGames.mockReturnValue(50);

      await execute(interaction, deps);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('full'),
        }),
      );
      expect(mockGameSearchService.search).not.toHaveBeenCalled();
    });

    it('reports no results when search finds nothing', async () => {
      mockGameSearchService.search.mockResolvedValue({ match: null, candidates: [] });

      await execute(interaction, deps);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('No Steam games found'),
        }),
      );
    });

    it('handles search errors gracefully', async () => {
      mockGameSearchService.search.mockRejectedValue(new Error('Network failure'));

      await execute(interaction, deps);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Something went wrong'),
        }),
      );
    });
  });

  describe('execute — remove subcommand', () => {
    beforeEach(() => {
      interaction.options.getSubcommand.mockReturnValue('remove');
    });

    it('removes a game by exact name match', async () => {
      mockWatchlistStore.listGames.mockReturnValue([
        { app_id: 730, name: 'Counter-Strike 2', added_at: '2024-01-01' },
      ]);

      await execute(interaction, deps);

      expect(mockWatchlistStore.removeGame).toHaveBeenCalledWith('guild123', 730);
      expect(interaction.editReply).toHaveBeenCalledWith({
        content: '✅ **Counter-Strike 2** has been removed from the watchlist.',
      });
    });

    it('removes a game by partial name match', async () => {
      interaction.options.getString.mockReturnValue('Counter');
      mockWatchlistStore.listGames.mockReturnValue([
        { app_id: 730, name: 'Counter-Strike 2', added_at: '2024-01-01' },
      ]);

      await execute(interaction, deps);

      expect(mockWatchlistStore.removeGame).toHaveBeenCalledWith('guild123', 730);
    });

    it('reports when watchlist is empty', async () => {
      mockWatchlistStore.listGames.mockReturnValue([]);

      await execute(interaction, deps);

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: 'The watchlist is empty.',
      });
    });

    it('reports when no match is found', async () => {
      interaction.options.getString.mockReturnValue('Nonexistent Game');
      mockWatchlistStore.listGames.mockReturnValue([
        { app_id: 730, name: 'Counter-Strike 2', added_at: '2024-01-01' },
      ]);

      await execute(interaction, deps);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('No game matching'),
        }),
      );
    });
  });

  describe('execute — list subcommand', () => {
    beforeEach(() => {
      interaction.options.getSubcommand.mockReturnValue('list');
    });

    it('shows empty state message', async () => {
      mockWatchlistStore.listGames.mockReturnValue([]);

      await execute(interaction, deps);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('empty'),
        }),
      );
    });

    it('shows an embed with all watched games', async () => {
      mockWatchlistStore.listGames.mockReturnValue([
        { app_id: 730, name: 'Counter-Strike 2', added_at: '2024-01-01', last_discount_percent: 0 },
        { app_id: 570, name: 'Dota 2', added_at: '2024-01-02', last_discount_percent: 50 },
      ]);

      await execute(interaction, deps);

      const call = interaction.editReply.mock.calls[0][0];
      expect(call.embeds).toHaveLength(1);
      const embedJson = call.embeds[0].toJSON();
      expect(embedJson.title).toBe('🎮 Steam Sale Watchlist');
      expect(embedJson.description).toContain('Counter-Strike 2');
      expect(embedJson.description).toContain('Dota 2');
      expect(embedJson.description).toContain('-50%');
    });
  });

  describe('execute — channel subcommand', () => {
    beforeEach(() => {
      interaction.options.getSubcommand.mockReturnValue('channel');
    });

    it('sets the notification channel', async () => {
      await execute(interaction, deps);

      expect(mockWatchlistStore.setNotificationChannel).toHaveBeenCalledWith('guild123', 'ch123');
      expect(interaction.editReply).toHaveBeenCalledWith({
        content: '✅ Sale notifications will be sent to <#ch123>.',
      });
    });

    it('rejects users without Manage Server permission', async () => {
      interaction.memberPermissions.has.mockReturnValue(false);

      await execute(interaction, deps);

      expect(mockWatchlistStore.setNotificationChannel).not.toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Manage Server'),
        }),
      );
    });

    it('rejects non-text channels', async () => {
      interaction.options.getChannel.mockReturnValue({ id: 'ch123', isTextBased: () => false });

      await execute(interaction, deps);

      expect(mockWatchlistStore.setNotificationChannel).not.toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('text channel'),
        }),
      );
    });
  });
});
