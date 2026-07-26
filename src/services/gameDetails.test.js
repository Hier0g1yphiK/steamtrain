import { describe, it, expect, vi } from 'vitest';
import { GameDetailsService } from './gameDetails.js';
import { RegionUnavailableError } from '../utils/errors.js';

function createMockSteamClient(response) {
  return {
    getAppDetails: vi.fn().mockResolvedValue(response),
  };
}

describe('GameDetailsService', () => {
  describe('getDetails', () => {
    it('should return a GameDetails object for a valid paid game', async () => {
      const appId = 730;
      const mockResponse = {
        '730': {
          success: true,
          data: {
            name: 'Counter-Strike 2',
            short_description: 'A competitive FPS game.',
            header_image: 'https://cdn.steam.com/header.jpg',
            genres: [
              { id: '1', description: 'Action' },
              { id: '2', description: 'FPS' },
            ],
            developers: ['Valve'],
            publishers: ['Valve'],
            release_date: { coming_soon: false, date: '21 Aug, 2012' },
            is_free: false,
            price_overview: {
              currency: 'GBP',
              initial: 1199,
              final: 1199,
              discount_percent: 0,
            },
            metacritic: { score: 83 },
          },
        },
      };

      const client = createMockSteamClient(mockResponse);
      const service = new GameDetailsService(client);
      const details = await service.getDetails(appId);

      expect(details).toEqual({
        appId: 730,
        name: 'Counter-Strike 2',
        shortDescription: 'A competitive FPS game.',
        headerImage: 'https://cdn.steam.com/header.jpg',
        genres: ['Action', 'FPS'],
        developers: ['Valve'],
        publishers: ['Valve'],
        releaseDate: '21 Aug, 2012',
        isFreeToPlay: false,
        price: {
          currency: 'GBP',
          current: 1199,
          original: null,
          discountPercent: 0,
        },
        metacriticScore: 83,
        storeUrl: 'https://store.steampowered.com/app/730',
      });

      expect(client.getAppDetails).toHaveBeenCalledWith(
        730,
        'gb',
        ['price_overview', 'short_description', 'header_image', 'genres', 'release_date', 'developers', 'publishers', 'metacritic']
      );
    });

    it('should return price with discount info when game is discounted', async () => {
      const appId = 570;
      const mockResponse = {
        '570': {
          success: true,
          data: {
            name: 'Dota 2',
            short_description: 'A MOBA game.',
            header_image: 'https://cdn.steam.com/dota2.jpg',
            genres: [{ id: '1', description: 'Strategy' }],
            developers: ['Valve'],
            publishers: ['Valve'],
            release_date: { coming_soon: false, date: '9 Jul, 2013' },
            is_free: false,
            price_overview: {
              currency: 'GBP',
              initial: 3999,
              final: 1999,
              discount_percent: 50,
            },
            metacritic: null,
          },
        },
      };

      const client = createMockSteamClient(mockResponse);
      const service = new GameDetailsService(client);
      const details = await service.getDetails(appId);

      expect(details.price).toEqual({
        currency: 'GBP',
        current: 1999,
        original: 3999,
        discountPercent: 50,
      });
      expect(details.metacriticScore).toBeNull();
    });

    it('should return null price for free-to-play games', async () => {
      const appId = 440;
      const mockResponse = {
        '440': {
          success: true,
          data: {
            name: 'Team Fortress 2',
            short_description: 'A team-based FPS.',
            header_image: 'https://cdn.steam.com/tf2.jpg',
            genres: [{ id: '1', description: 'Action' }],
            developers: ['Valve'],
            publishers: ['Valve'],
            release_date: { coming_soon: false, date: '10 Oct, 2007' },
            is_free: true,
            metacritic: { score: 92 },
          },
        },
      };

      const client = createMockSteamClient(mockResponse);
      const service = new GameDetailsService(client);
      const details = await service.getDetails(appId);

      expect(details.isFreeToPlay).toBe(true);
      expect(details.price).toBeNull();
    });

    it('should throw RegionUnavailableError when success is false', async () => {
      const appId = 999;
      const mockResponse = {
        '999': {
          success: false,
        },
      };

      const client = createMockSteamClient(mockResponse);
      const service = new GameDetailsService(client);

      await expect(service.getDetails(appId)).rejects.toThrow(RegionUnavailableError);
    });

    it('should throw RegionUnavailableError when appId is not in response', async () => {
      const appId = 999;
      const mockResponse = {};

      const client = createMockSteamClient(mockResponse);
      const service = new GameDetailsService(client);

      await expect(service.getDetails(appId)).rejects.toThrow(RegionUnavailableError);
    });

    it('should truncate short description to 300 characters', async () => {
      const appId = 100;
      const longDescription = 'A'.repeat(500);
      const mockResponse = {
        '100': {
          success: true,
          data: {
            name: 'Long Desc Game',
            short_description: longDescription,
            header_image: 'https://cdn.steam.com/img.jpg',
            genres: [],
            developers: [],
            publishers: [],
            release_date: { date: '1 Jan, 2024' },
            is_free: false,
            price_overview: {
              currency: 'GBP',
              initial: 999,
              final: 999,
              discount_percent: 0,
            },
            metacritic: null,
          },
        },
      };

      const client = createMockSteamClient(mockResponse);
      const service = new GameDetailsService(client);
      const details = await service.getDetails(appId);

      expect(details.shortDescription).toHaveLength(300);
    });

    it('should handle missing optional fields gracefully', async () => {
      const appId = 200;
      const mockResponse = {
        '200': {
          success: true,
          data: {
            name: 'Minimal Game',
            is_free: false,
          },
        },
      };

      const client = createMockSteamClient(mockResponse);
      const service = new GameDetailsService(client);
      const details = await service.getDetails(appId);

      expect(details.shortDescription).toBe('');
      expect(details.headerImage).toBe('');
      expect(details.genres).toEqual([]);
      expect(details.developers).toEqual([]);
      expect(details.publishers).toEqual([]);
      expect(details.releaseDate).toBe('');
      expect(details.price).toBeNull();
      expect(details.metacriticScore).toBeNull();
    });
  });
});
