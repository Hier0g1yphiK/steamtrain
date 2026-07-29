/**
 * Unit tests for SaleCheckerService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SaleCheckerService } from './saleChecker.js';

describe('SaleCheckerService', () => {
  let saleChecker;
  let mockWatchlistStore;
  let mockSteamClient;
  let mockDiscordClient;
  let mockChannel;

  beforeEach(() => {
    mockChannel = {
      isTextBased: () => true,
      send: vi.fn().mockResolvedValue(undefined),
    };

    mockWatchlistStore = {
      getAllWatchedGames: vi.fn().mockReturnValue([]),
      getGuildsWatchingApp: vi.fn().mockReturnValue([]),
      getNotificationChannel: vi.fn().mockReturnValue('channel123'),
      updatePrice: vi.fn(),
    };

    mockSteamClient = {
      getAppDetails: vi.fn().mockResolvedValue({}),
    };

    mockDiscordClient = {
      channels: {
        fetch: vi.fn().mockResolvedValue(mockChannel),
      },
    };

    saleChecker = new SaleCheckerService({
      watchlistStore: mockWatchlistStore,
      steamClient: mockSteamClient,
      discordClient: mockDiscordClient,
    });

    // Override the batch delay to 0 so tests don't wait on setTimeout
    saleChecker._batchDelayMs = 0;
  });

  afterEach(() => {
    saleChecker.stop();
  });

  it('starts and stops the interval', () => {
    saleChecker.start();
    expect(saleChecker._intervalId).not.toBeNull();
    saleChecker.stop();
    expect(saleChecker._intervalId).toBeNull();
  });

  it('does nothing when there are no watched games', async () => {
    mockWatchlistStore.getAllWatchedGames.mockReturnValue([]);
    await saleChecker._check();
    expect(mockSteamClient.getAppDetails).not.toHaveBeenCalled();
  });

  it('checks price for watched games', async () => {
    mockWatchlistStore.getAllWatchedGames.mockReturnValue([
      { app_id: 730, name: 'Counter-Strike 2' },
    ]);
    mockSteamClient.getAppDetails.mockResolvedValue({
      '730': {
        success: true,
        data: {
          name: 'Counter-Strike 2',
          is_free: false,
          price_overview: {
            final: 1049,
            initial: 1399,
            discount_percent: 25,
          },
        },
      },
    });
    mockWatchlistStore.getGuildsWatchingApp.mockReturnValue([
      { guild_id: 'guild1', last_known_price: 1399, last_discount_percent: 0 },
    ]);

    await saleChecker._check();

    expect(mockSteamClient.getAppDetails).toHaveBeenCalledWith(730, 'gb', ['price_overview', 'basic']);
    expect(mockWatchlistStore.updatePrice).toHaveBeenCalledWith('guild1', 730, 1049, 25);
  });

  it('sends a notification when a new discount is detected', async () => {
    mockWatchlistStore.getAllWatchedGames.mockReturnValue([
      { app_id: 730, name: 'Counter-Strike 2' },
    ]);
    mockSteamClient.getAppDetails.mockResolvedValue({
      '730': {
        success: true,
        data: {
          name: 'Counter-Strike 2',
          is_free: false,
          price_overview: {
            final: 1049,
            initial: 1399,
            discount_percent: 25,
          },
        },
      },
    });
    mockWatchlistStore.getGuildsWatchingApp.mockReturnValue([
      { guild_id: 'guild1', last_known_price: 1399, last_discount_percent: 0 },
    ]);

    await saleChecker._check();

    expect(mockDiscordClient.channels.fetch).toHaveBeenCalledWith('channel123');
    expect(mockChannel.send).toHaveBeenCalled();
    const sentEmbed = mockChannel.send.mock.calls[0][0].embeds[0];
    expect(sentEmbed).toBeDefined();
  });

  it('does not notify when discount has not increased', async () => {
    mockWatchlistStore.getAllWatchedGames.mockReturnValue([
      { app_id: 730, name: 'Counter-Strike 2' },
    ]);
    mockSteamClient.getAppDetails.mockResolvedValue({
      '730': {
        success: true,
        data: {
          name: 'Counter-Strike 2',
          is_free: false,
          price_overview: {
            final: 1049,
            initial: 1399,
            discount_percent: 25,
          },
        },
      },
    });
    mockWatchlistStore.getGuildsWatchingApp.mockReturnValue([
      { guild_id: 'guild1', last_known_price: 1049, last_discount_percent: 25 },
    ]);

    await saleChecker._check();

    expect(mockChannel.send).not.toHaveBeenCalled();
  });

  it('does not notify when there is no discount', async () => {
    mockWatchlistStore.getAllWatchedGames.mockReturnValue([
      { app_id: 730, name: 'Counter-Strike 2' },
    ]);
    mockSteamClient.getAppDetails.mockResolvedValue({
      '730': {
        success: true,
        data: {
          name: 'Counter-Strike 2',
          is_free: false,
          price_overview: {
            final: 1399,
            initial: 1399,
            discount_percent: 0,
          },
        },
      },
    });
    mockWatchlistStore.getGuildsWatchingApp.mockReturnValue([
      { guild_id: 'guild1', last_known_price: 1399, last_discount_percent: 0 },
    ]);

    await saleChecker._check();

    expect(mockChannel.send).not.toHaveBeenCalled();
  });

  it('skips free-to-play games', async () => {
    mockWatchlistStore.getAllWatchedGames.mockReturnValue([
      { app_id: 570, name: 'Dota 2' },
    ]);
    mockSteamClient.getAppDetails.mockResolvedValue({
      '570': {
        success: true,
        data: {
          name: 'Dota 2',
          is_free: true,
        },
      },
    });

    await saleChecker._check();

    expect(mockWatchlistStore.getGuildsWatchingApp).not.toHaveBeenCalled();
  });

  it('skips games where API returns failure', async () => {
    mockWatchlistStore.getAllWatchedGames.mockReturnValue([
      { app_id: 999, name: 'Unknown Game' },
    ]);
    mockSteamClient.getAppDetails.mockResolvedValue({
      '999': { success: false },
    });

    await saleChecker._check();

    expect(mockWatchlistStore.getGuildsWatchingApp).not.toHaveBeenCalled();
  });

  it('does not send notification if no channel is configured', async () => {
    mockWatchlistStore.getAllWatchedGames.mockReturnValue([
      { app_id: 730, name: 'Counter-Strike 2' },
    ]);
    mockSteamClient.getAppDetails.mockResolvedValue({
      '730': {
        success: true,
        data: {
          name: 'Counter-Strike 2',
          is_free: false,
          price_overview: {
            final: 1049,
            initial: 1399,
            discount_percent: 25,
          },
        },
      },
    });
    mockWatchlistStore.getGuildsWatchingApp.mockReturnValue([
      { guild_id: 'guild1', last_known_price: 1399, last_discount_percent: 0 },
    ]);
    mockWatchlistStore.getNotificationChannel.mockReturnValue(null);

    await saleChecker._check();

    expect(mockDiscordClient.channels.fetch).not.toHaveBeenCalled();
    expect(mockChannel.send).not.toHaveBeenCalled();
  });

  it('handles API errors gracefully and continues to next game', async () => {
    mockWatchlistStore.getAllWatchedGames.mockReturnValue([
      { app_id: 730, name: 'Counter-Strike 2' },
      { app_id: 570, name: 'Dota 2' },
    ]);
    mockSteamClient.getAppDetails
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        '570': {
          success: true,
          data: {
            name: 'Dota 2',
            is_free: true,
          },
        },
      });

    // Should not throw
    await saleChecker._check();

    // Second game should still be checked
    expect(mockSteamClient.getAppDetails).toHaveBeenCalledTimes(2);
  });
});
