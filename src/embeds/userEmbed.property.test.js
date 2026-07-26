// Feature: steam-discord-bot, Property 6: User embed completeness

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildUserEmbed } from './userEmbed.js';

/**
 * Property 6: User embed completeness
 * Validates: Requirements 3.7
 *
 * For any valid UserProfile, the embed contains all required fields
 * and conditionally includes country and game count.
 */

const onlineStatusArb = fc.constantFrom(
  'Online', 'Offline', 'Away', 'Snooze', 'Looking to Trade', 'Looking to Play'
);

const visibilityArb = fc.constantFrom('Public', 'Private');

const userProfileArb = fc.record({
  steamId64: fc.stringMatching(/^[0-9]{17}$/),
  personaName: fc.string({ minLength: 1, maxLength: 50 }),
  avatarUrl: fc.webUrl(),
  profileUrl: fc.webUrl(),
  onlineStatus: onlineStatusArb,
  visibility: visibilityArb,
  country: fc.oneof(fc.constant(null), fc.stringMatching(/^[A-Z]{2}$/)),
  gameCount: fc.oneof(fc.constant(null), fc.nat({ max: 50000 })),
});

describe('Property 6: User embed completeness', () => {
  it('embed always contains persona name as title, avatar as thumbnail, profile URL as link, status and visibility fields', () => {
    fc.assert(
      fc.property(userProfileArb, (profile) => {
        const embed = buildUserEmbed(profile);
        const data = embed.toJSON();

        // Title is persona name
        expect(data.title).toBe(profile.personaName);

        // Thumbnail is avatar URL
        expect(data.thumbnail.url).toBe(profile.avatarUrl);

        // URL is profile URL
        expect(data.url).toBe(profile.profileUrl);

        // Status field exists with correct value
        const statusField = data.fields.find(f => f.name === 'Status');
        expect(statusField).toBeDefined();
        expect(statusField.value).toBe(profile.onlineStatus);

        // Visibility field exists with correct value
        const visField = data.fields.find(f => f.name === 'Visibility');
        expect(visField).toBeDefined();
        expect(visField.value).toBe(profile.visibility);
      }),
      { numRuns: 100 }
    );
  });

  it('includes Country field if and only if visibility is Public AND country is non-null', () => {
    fc.assert(
      fc.property(userProfileArb, (profile) => {
        const embed = buildUserEmbed(profile);
        const data = embed.toJSON();
        const countryField = data.fields.find(f => f.name === 'Country');

        if (profile.visibility === 'Public' && profile.country != null) {
          expect(countryField).toBeDefined();
          expect(countryField.value).toBe(profile.country);
        } else {
          expect(countryField).toBeUndefined();
        }
      }),
      { numRuns: 100 }
    );
  });

  it('includes Games Owned field if and only if visibility is Public AND gameCount is non-null', () => {
    fc.assert(
      fc.property(userProfileArb, (profile) => {
        const embed = buildUserEmbed(profile);
        const data = embed.toJSON();
        const gamesField = data.fields.find(f => f.name === 'Games Owned');

        if (profile.visibility === 'Public' && profile.gameCount != null) {
          expect(gamesField).toBeDefined();
          expect(gamesField.value).toBe(String(profile.gameCount));
        } else {
          expect(gamesField).toBeUndefined();
        }
      }),
      { numRuns: 100 }
    );
  });
});
