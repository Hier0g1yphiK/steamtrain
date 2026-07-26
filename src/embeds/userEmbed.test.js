import { describe, it, expect } from 'vitest';
import { buildUserEmbed } from './userEmbed.js';

describe('buildUserEmbed', () => {
  const publicProfile = {
    steamId64: '76561198000000000',
    personaName: 'TestUser',
    avatarUrl: 'https://avatars.steamstatic.com/example_full.jpg',
    profileUrl: 'https://steamcommunity.com/id/testuser/',
    onlineStatus: 'Online',
    visibility: 'Public',
    country: 'GB',
    gameCount: 42,
  };

  const privateProfile = {
    steamId64: '76561198000000001',
    personaName: 'PrivateUser',
    avatarUrl: 'https://avatars.steamstatic.com/private_full.jpg',
    profileUrl: 'https://steamcommunity.com/profiles/76561198000000001/',
    onlineStatus: 'Offline',
    visibility: 'Private',
    country: null,
    gameCount: null,
  };

  it('sets persona name as embed title', () => {
    const embed = buildUserEmbed(publicProfile);
    expect(embed.data.title).toBe('TestUser');
  });

  it('sets profile URL as the embed URL', () => {
    const embed = buildUserEmbed(publicProfile);
    expect(embed.data.url).toBe('https://steamcommunity.com/id/testuser/');
  });

  it('sets avatar as thumbnail', () => {
    const embed = buildUserEmbed(publicProfile);
    expect(embed.data.thumbnail.url).toBe('https://avatars.steamstatic.com/example_full.jpg');
  });

  it('includes online status field', () => {
    const embed = buildUserEmbed(publicProfile);
    const statusField = embed.data.fields.find(f => f.name === 'Status');
    expect(statusField).toBeDefined();
    expect(statusField.value).toBe('Online');
  });

  it('includes visibility field', () => {
    const embed = buildUserEmbed(publicProfile);
    const visField = embed.data.fields.find(f => f.name === 'Visibility');
    expect(visField).toBeDefined();
    expect(visField.value).toBe('Public');
  });

  it('includes country when profile is public and country is non-null', () => {
    const embed = buildUserEmbed(publicProfile);
    const countryField = embed.data.fields.find(f => f.name === 'Country');
    expect(countryField).toBeDefined();
    expect(countryField.value).toBe('GB');
  });

  it('includes game count when profile is public and gameCount is non-null', () => {
    const embed = buildUserEmbed(publicProfile);
    const gamesField = embed.data.fields.find(f => f.name === 'Games Owned');
    expect(gamesField).toBeDefined();
    expect(gamesField.value).toBe('42');
  });

  it('omits country when profile is private', () => {
    const embed = buildUserEmbed(privateProfile);
    const countryField = embed.data.fields.find(f => f.name === 'Country');
    expect(countryField).toBeUndefined();
  });

  it('omits game count when profile is private', () => {
    const embed = buildUserEmbed(privateProfile);
    const gamesField = embed.data.fields.find(f => f.name === 'Games Owned');
    expect(gamesField).toBeUndefined();
  });

  it('omits country when profile is public but country is null', () => {
    const profile = { ...publicProfile, country: null };
    const embed = buildUserEmbed(profile);
    const countryField = embed.data.fields.find(f => f.name === 'Country');
    expect(countryField).toBeUndefined();
  });

  it('omits game count when profile is public but gameCount is null', () => {
    const profile = { ...publicProfile, gameCount: null };
    const embed = buildUserEmbed(profile);
    const gamesField = embed.data.fields.find(f => f.name === 'Games Owned');
    expect(gamesField).toBeUndefined();
  });

  it('handles all online status values', () => {
    const statuses = ['Online', 'Offline', 'Away', 'Snooze', 'Looking to Trade', 'Looking to Play'];
    for (const status of statuses) {
      const profile = { ...publicProfile, onlineStatus: status };
      const embed = buildUserEmbed(profile);
      const statusField = embed.data.fields.find(f => f.name === 'Status');
      expect(statusField.value).toBe(status);
    }
  });
});
