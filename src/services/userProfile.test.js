import { describe, it, expect, vi } from 'vitest';
import { UserProfileService } from './userProfile.js';
import { UserNotFoundError } from '../utils/errors.js';

function createMockClient({ summaryResponse, gamesResponse, gamesThrows } = {}) {
  return {
    getPlayerSummaries: vi.fn().mockResolvedValue(
      summaryResponse ?? { response: { players: [] } }
    ),
    getOwnedGames: gamesThrows
      ? vi.fn().mockRejectedValue(new Error('fetch failed'))
      : vi.fn().mockResolvedValue(
          gamesResponse ?? { response: { game_count: 42, games: [] } }
        ),
  };
}

describe('UserProfileService', () => {
  describe('getProfile', () => {
    it('throws UserNotFoundError when no players are returned', async () => {
      const client = createMockClient({
        summaryResponse: { response: { players: [] } },
      });
      const service = new UserProfileService(client);

      await expect(service.getProfile('76561198000000000'))
        .rejects.toThrow(UserNotFoundError);
    });

    it('returns a complete public profile with game count', async () => {
      const client = createMockClient({
        summaryResponse: {
          response: {
            players: [{
              steamid: '76561198000000000',
              personaname: 'TestUser',
              avatarfull: 'https://avatars.example.com/full.jpg',
              avatar: 'https://avatars.example.com/small.jpg',
              profileurl: 'https://steamcommunity.com/id/testuser/',
              personastate: 1,
              communityvisibilitystate: 3,
              loccountrycode: 'GB',
            }],
          },
        },
        gamesResponse: { response: { game_count: 150, games: [] } },
      });
      const service = new UserProfileService(client);

      const profile = await service.getProfile('76561198000000000');

      expect(profile).toEqual({
        steamId64: '76561198000000000',
        personaName: 'TestUser',
        avatarUrl: 'https://avatars.example.com/full.jpg',
        profileUrl: 'https://steamcommunity.com/id/testuser/',
        onlineStatus: 'Online',
        visibility: 'Public',
        country: 'GB',
        gameCount: 150,
      });

      expect(client.getPlayerSummaries).toHaveBeenCalledWith('76561198000000000');
      expect(client.getOwnedGames).toHaveBeenCalledWith('76561198000000000');
    });

    it('returns a private profile with null country and gameCount', async () => {
      const client = createMockClient({
        summaryResponse: {
          response: {
            players: [{
              steamid: '76561198000000001',
              personaname: 'PrivateUser',
              avatarfull: 'https://avatars.example.com/private.jpg',
              profileurl: 'https://steamcommunity.com/profiles/76561198000000001/',
              personastate: 0,
              communityvisibilitystate: 1,
              loccountrycode: 'US',
            }],
          },
        },
      });
      const service = new UserProfileService(client);

      const profile = await service.getProfile('76561198000000001');

      expect(profile).toEqual({
        steamId64: '76561198000000001',
        personaName: 'PrivateUser',
        avatarUrl: 'https://avatars.example.com/private.jpg',
        profileUrl: 'https://steamcommunity.com/profiles/76561198000000001/',
        onlineStatus: 'Offline',
        visibility: 'Private',
        country: null,
        gameCount: null,
      });

      expect(client.getOwnedGames).not.toHaveBeenCalled();
    });

    it('maps all personastate values to correct online status', async () => {
      const expectedMappings = [
        [0, 'Offline'],
        [1, 'Online'],
        [2, 'Away'],
        [3, 'Away'],
        [4, 'Snooze'],
        [5, 'Looking to Trade'],
        [6, 'Looking to Play'],
      ];

      for (const [state, expected] of expectedMappings) {
        const client = createMockClient({
          summaryResponse: {
            response: {
              players: [{
                steamid: '76561198000000000',
                personaname: 'User',
                avatarfull: 'https://example.com/avatar.jpg',
                profileurl: 'https://steamcommunity.com/id/user/',
                personastate: state,
                communityvisibilitystate: 1,
              }],
            },
          },
        });
        const service = new UserProfileService(client);
        const profile = await service.getProfile('76561198000000000');
        expect(profile.onlineStatus).toBe(expected);
      }
    });

    it('defaults to Offline for unknown personastate values', async () => {
      const client = createMockClient({
        summaryResponse: {
          response: {
            players: [{
              steamid: '76561198000000000',
              personaname: 'User',
              avatarfull: 'https://example.com/avatar.jpg',
              profileurl: 'https://steamcommunity.com/id/user/',
              personastate: 99,
              communityvisibilitystate: 1,
            }],
          },
        },
      });
      const service = new UserProfileService(client);
      const profile = await service.getProfile('76561198000000000');
      expect(profile.onlineStatus).toBe('Offline');
    });

    it('returns gameCount as null when getOwnedGames fails for public profile', async () => {
      const client = createMockClient({
        summaryResponse: {
          response: {
            players: [{
              steamid: '76561198000000000',
              personaname: 'User',
              avatarfull: 'https://example.com/avatar.jpg',
              profileurl: 'https://steamcommunity.com/id/user/',
              personastate: 1,
              communityvisibilitystate: 3,
              loccountrycode: 'DE',
            }],
          },
        },
        gamesThrows: true,
      });
      const service = new UserProfileService(client);
      const profile = await service.getProfile('76561198000000000');

      expect(profile.visibility).toBe('Public');
      expect(profile.gameCount).toBeNull();
      expect(profile.country).toBe('DE');
    });

    it('uses avatar fallback when avatarfull is missing', async () => {
      const client = createMockClient({
        summaryResponse: {
          response: {
            players: [{
              steamid: '76561198000000000',
              personaname: 'User',
              avatar: 'https://example.com/small.jpg',
              profileurl: 'https://steamcommunity.com/id/user/',
              personastate: 1,
              communityvisibilitystate: 1,
            }],
          },
        },
      });
      const service = new UserProfileService(client);
      const profile = await service.getProfile('76561198000000000');
      expect(profile.avatarUrl).toBe('https://example.com/small.jpg');
    });

    it('returns null country when loccountrycode is not present on public profile', async () => {
      const client = createMockClient({
        summaryResponse: {
          response: {
            players: [{
              steamid: '76561198000000000',
              personaname: 'User',
              avatarfull: 'https://example.com/avatar.jpg',
              profileurl: 'https://steamcommunity.com/id/user/',
              personastate: 1,
              communityvisibilitystate: 3,
            }],
          },
        },
        gamesResponse: { response: { game_count: 5, games: [] } },
      });
      const service = new UserProfileService(client);
      const profile = await service.getProfile('76561198000000000');
      expect(profile.country).toBeNull();
      expect(profile.gameCount).toBe(5);
    });
  });
});
