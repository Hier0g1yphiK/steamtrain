import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('exports config with token and api key when both are set', async () => {
    process.env.DISCORD_TOKEN = 'test-token';
    process.env.DISCORD_APPLICATION_ID = 'test-app-id';
    process.env.STEAM_API_KEY = 'test-key';
    process.env.TWITCH_CLIENT_ID = 'test-twitch-id';
    process.env.TWITCH_CLIENT_SECRET = 'test-twitch-secret';

    const { config } = await import('./config.js');

    expect(config.discordToken).toBe('test-token');
    expect(config.discordApplicationId).toBe('test-app-id');
    expect(config.steamApiKey).toBe('test-key');
    expect(config.twitchClientId).toBe('test-twitch-id');
    expect(config.twitchClientSecret).toBe('test-twitch-secret');
  });

  it('exits with non-zero code when DISCORD_TOKEN is missing', async () => {
    process.env.DISCORD_TOKEN = '';
    process.env.DISCORD_APPLICATION_ID = 'test-app-id';
    process.env.STEAM_API_KEY = 'test-key';
    process.env.TWITCH_CLIENT_ID = 'test-twitch-id';
    process.env.TWITCH_CLIENT_SECRET = 'test-twitch-secret';

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    const mockStderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(import('./config.js')).rejects.toThrow('process.exit called');

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockStderr).toHaveBeenCalledWith(
      expect.stringContaining('DISCORD_TOKEN')
    );

    mockExit.mockRestore();
    mockStderr.mockRestore();
  });

  it('exits with non-zero code when STEAM_API_KEY is missing', async () => {
    process.env.DISCORD_TOKEN = 'test-token';
    process.env.DISCORD_APPLICATION_ID = 'test-app-id';
    process.env.STEAM_API_KEY = '';
    process.env.TWITCH_CLIENT_ID = 'test-twitch-id';
    process.env.TWITCH_CLIENT_SECRET = 'test-twitch-secret';

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    const mockStderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(import('./config.js')).rejects.toThrow('process.exit called');

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockStderr).toHaveBeenCalledWith(
      expect.stringContaining('STEAM_API_KEY')
    );

    mockExit.mockRestore();
    mockStderr.mockRestore();
  });

  it('exits and lists all missing variables when both are missing', async () => {
    delete process.env.DISCORD_TOKEN;
    delete process.env.STEAM_API_KEY;
    delete process.env.TWITCH_CLIENT_ID;
    delete process.env.TWITCH_CLIENT_SECRET;

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    const mockStderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(import('./config.js')).rejects.toThrow('process.exit called');

    expect(mockExit).toHaveBeenCalledWith(1);
    const errorMessage = mockStderr.mock.calls[0][0];
    expect(errorMessage).toContain('DISCORD_TOKEN');
    expect(errorMessage).toContain('STEAM_API_KEY');

    mockExit.mockRestore();
    mockStderr.mockRestore();
  });
});
