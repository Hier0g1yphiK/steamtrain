import { describe, it, expect, vi } from 'vitest';
import { UserResolveService } from './userResolve.js';
import { UserNotFoundError, InvalidInputError } from '../utils/errors.js';

function createMockSteamClient(resolveResult) {
  return {
    resolveVanityURL: vi.fn().mockResolvedValue(resolveResult),
  };
}

describe('UserResolveService', () => {
  describe('profile URL resolution', () => {
    it('extracts SteamID64 from a profile URL', async () => {
      const client = createMockSteamClient();
      const service = new UserResolveService(client);

      const result = await service.resolve(
        'https://steamcommunity.com/profiles/76561198012345678'
      );

      expect(result).toEqual({ steamId64: '76561198012345678' });
      expect(client.resolveVanityURL).not.toHaveBeenCalled();
    });

    it('handles profile URL with trailing slash', async () => {
      const client = createMockSteamClient();
      const service = new UserResolveService(client);

      const result = await service.resolve(
        'https://steamcommunity.com/profiles/76561198012345678/'
      );

      expect(result).toEqual({ steamId64: '76561198012345678' });
    });

    it('handles http profile URL', async () => {
      const client = createMockSteamClient();
      const service = new UserResolveService(client);

      const result = await service.resolve(
        'http://steamcommunity.com/profiles/76561198012345678'
      );

      expect(result).toEqual({ steamId64: '76561198012345678' });
    });
  });

  describe('vanity URL resolution', () => {
    it('resolves vanity URL via API', async () => {
      const client = createMockSteamClient({
        response: { success: 1, steamid: '76561198099999999' },
      });
      const service = new UserResolveService(client);

      const result = await service.resolve(
        'https://steamcommunity.com/id/gabelogannewell'
      );

      expect(result).toEqual({ steamId64: '76561198099999999' });
      expect(client.resolveVanityURL).toHaveBeenCalledWith('gabelogannewell');
    });

    it('handles vanity URL with trailing slash', async () => {
      const client = createMockSteamClient({
        response: { success: 1, steamid: '76561198099999999' },
      });
      const service = new UserResolveService(client);

      const result = await service.resolve(
        'https://steamcommunity.com/id/gabelogannewell/'
      );

      expect(result).toEqual({ steamId64: '76561198099999999' });
      expect(client.resolveVanityURL).toHaveBeenCalledWith('gabelogannewell');
    });

    it('throws UserNotFoundError when vanity URL resolution fails', async () => {
      const client = createMockSteamClient({
        response: { success: 42, message: 'No match' },
      });
      const service = new UserResolveService(client);

      await expect(
        service.resolve('https://steamcommunity.com/id/nonexistentuser')
      ).rejects.toThrow(UserNotFoundError);
    });
  });

  describe('raw SteamID64 resolution', () => {
    it('uses 17-digit number directly as SteamID64', async () => {
      const client = createMockSteamClient();
      const service = new UserResolveService(client);

      const result = await service.resolve('76561198012345678');

      expect(result).toEqual({ steamId64: '76561198012345678' });
      expect(client.resolveVanityURL).not.toHaveBeenCalled();
    });

    it('does not treat 16-digit number as SteamID64', async () => {
      const client = createMockSteamClient({
        response: { success: 1, steamid: '76561198099999999' },
      });
      const service = new UserResolveService(client);

      await service.resolve('1234567890123456');

      // Should be treated as vanity name since it's not 17 digits
      expect(client.resolveVanityURL).toHaveBeenCalledWith('1234567890123456');
    });

    it('does not treat 18-digit number as SteamID64', async () => {
      const client = createMockSteamClient({
        response: { success: 1, steamid: '76561198099999999' },
      });
      const service = new UserResolveService(client);

      await service.resolve('123456789012345678');

      // Should be treated as vanity name since it's not exactly 17 digits
      expect(client.resolveVanityURL).toHaveBeenCalledWith('123456789012345678');
    });
  });

  describe('vanity name resolution', () => {
    it('resolves plain vanity name via API', async () => {
      const client = createMockSteamClient({
        response: { success: 1, steamid: '76561198099999999' },
      });
      const service = new UserResolveService(client);

      const result = await service.resolve('gabelogannewell');

      expect(result).toEqual({ steamId64: '76561198099999999' });
      expect(client.resolveVanityURL).toHaveBeenCalledWith('gabelogannewell');
    });

    it('throws UserNotFoundError when vanity name resolution fails', async () => {
      const client = createMockSteamClient({
        response: { success: 42, message: 'No match' },
      });
      const service = new UserResolveService(client);

      await expect(service.resolve('nonexistentuser')).rejects.toThrow(
        UserNotFoundError
      );
    });
  });

  describe('invalid input handling', () => {
    it('throws InvalidInputError for empty string', async () => {
      const client = createMockSteamClient();
      const service = new UserResolveService(client);

      await expect(service.resolve('')).rejects.toThrow(InvalidInputError);
    });

    it('throws InvalidInputError for whitespace-only string', async () => {
      const client = createMockSteamClient();
      const service = new UserResolveService(client);

      await expect(service.resolve('   ')).rejects.toThrow(InvalidInputError);
    });

    it('throws InvalidInputError for null', async () => {
      const client = createMockSteamClient();
      const service = new UserResolveService(client);

      await expect(service.resolve(null)).rejects.toThrow(InvalidInputError);
    });

    it('throws InvalidInputError for undefined', async () => {
      const client = createMockSteamClient();
      const service = new UserResolveService(client);

      await expect(service.resolve(undefined)).rejects.toThrow(InvalidInputError);
    });
  });

  describe('input trimming', () => {
    it('trims whitespace from input before resolving', async () => {
      const client = createMockSteamClient();
      const service = new UserResolveService(client);

      const result = await service.resolve('  76561198012345678  ');

      expect(result).toEqual({ steamId64: '76561198012345678' });
    });
  });
});
