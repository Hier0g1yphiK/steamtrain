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
    process.env.STEAM_API_KEY = 'test-key';

    const { config } = await import('./config.js');

    expect(config.discordToken).toBe('test-token');
    expect(config.steamApiKey).toBe('test-key');
  });

  it('exits with non-zero code when DISCORD_TOKEN is missing', async () => {
    process.env.DISCORD_TOKEN = '';
    process.env.STEAM_API_KEY = 'test-key';

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
    process.env.STEAM_API_KEY = '';

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
