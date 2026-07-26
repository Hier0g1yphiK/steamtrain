import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execute, command } from './steamuser.js';
import { UserNotFoundError, InvalidInputError, TimeoutError, ApiError } from '../utils/errors.js';

describe('steamuser command', () => {
  describe('command definition', () => {
    it('has the correct name', () => {
      expect(command.name).toBe('steamuser');
    });

    it('has a description mentioning accepted formats', () => {
      expect(command.description).toContain('profile URL');
      expect(command.description).toContain('vanity name');
      expect(command.description).toContain('SteamID64');
    });

    it('has a required query option', () => {
      const queryOption = command.options.find((o) => o.name === 'query');
      expect(queryOption).toBeDefined();
      expect(queryOption.required).toBe(true);
      expect(queryOption.type).toBe(3); // STRING type
    });
  });

  describe('execute', () => {
    let interaction;
    let userResolveService;
    let userProfileService;

    beforeEach(() => {
      interaction = {
        commandName: 'steamuser',
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
        options: {
          getString: vi.fn().mockReturnValue('testuser'),
          data: [{ name: 'query', value: 'testuser' }],
        },
      };

      userResolveService = {
        resolve: vi.fn().mockResolvedValue({ steamId64: '76561198000000000' }),
      };

      userProfileService = {
        getProfile: vi.fn().mockResolvedValue({
          steamId64: '76561198000000000',
          personaName: 'TestUser',
          avatarUrl: 'https://example.com/avatar.jpg',
          profileUrl: 'https://steamcommunity.com/id/testuser/',
          onlineStatus: 'Online',
          visibility: 'Public',
          country: 'GB',
          gameCount: 150,
        }),
      };
    });

    it('defers the reply before making service calls', async () => {
      await execute(interaction, { userResolveService, userProfileService });

      expect(interaction.deferReply).toHaveBeenCalled();
      expect(interaction.deferReply.mock.invocationCallOrder[0]).toBeLessThan(
        userResolveService.resolve.mock.invocationCallOrder[0]
      );
    });

    it('resolves the user, fetches profile, and replies with an embed', async () => {
      await execute(interaction, { userResolveService, userProfileService });

      expect(userResolveService.resolve).toHaveBeenCalledWith('testuser');
      expect(userProfileService.getProfile).toHaveBeenCalledWith('76561198000000000');
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([expect.anything()]),
        })
      );
    });

    it('maps UserNotFoundError to a user-friendly message', async () => {
      userResolveService.resolve.mockRejectedValue(new UserNotFoundError('not found'));

      await execute(interaction, { userResolveService, userProfileService });

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: 'Could not find that Steam user. Please check the spelling or try a profile URL.',
      });
    });

    it('maps InvalidInputError to a user-friendly message', async () => {
      userResolveService.resolve.mockRejectedValue(new InvalidInputError('bad input'));

      await execute(interaction, { userResolveService, userProfileService });

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: 'Invalid input. Accepted formats: profile URL, vanity name, or 17-digit SteamID64.',
      });
    });

    it('maps TimeoutError to a user-friendly message', async () => {
      userResolveService.resolve.mockRejectedValue(new TimeoutError('timed out'));

      await execute(interaction, { userResolveService, userProfileService });

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: 'The request timed out. Please try again.',
      });
    });

    it('maps unknown errors to a generic message', async () => {
      userResolveService.resolve.mockRejectedValue(new ApiError('server error', 500, 'fail'));

      await execute(interaction, { userResolveService, userProfileService });

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: 'Something went wrong. Please try again later.',
      });
    });

    it('logs errors with structured fields', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new UserNotFoundError('not found');
      userResolveService.resolve.mockRejectedValue(error);

      await execute(interaction, { userResolveService, userProfileService });

      expect(consoleSpy).toHaveBeenCalled();
      const logOutput = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(logOutput.command).toBe('steamuser');
      expect(logOutput.errorType).toBe('UserNotFoundError');
      expect(logOutput.errorMessage).toBe('not found');

      consoleSpy.mockRestore();
    });
  });
});
