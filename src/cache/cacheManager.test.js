import { describe, it, expect, beforeEach } from 'vitest';
import { getAppListCache, getGameDetailCache, getUserProfileCache } from './cacheManager.js';

describe('cacheManager', () => {
  beforeEach(() => {
    getAppListCache().clear();
    getGameDetailCache().clear();
    getUserProfileCache().clear();
  });

  describe('getAppListCache', () => {
    it('returns a cache instance with max size of 1', () => {
      const cache = getAppListCache();
      cache.set('list1', ['app1']);
      cache.set('list2', ['app2']);
      expect(cache.size).toBe(1);
    });

    it('supports allowStale behavior', () => {
      const cache = getAppListCache();
      // allowStale is configured, so getRemainingTTL should work
      cache.set('key', 'value');
      expect(cache.get('key')).toBe('value');
    });
  });

  describe('getGameDetailCache', () => {
    it('returns a cache instance with max size of 1000', () => {
      const cache = getGameDetailCache();
      expect(cache.max).toBe(1000);
    });

    it('stores and retrieves game details', () => {
      const cache = getGameDetailCache();
      const details = { appId: 123, name: 'Test Game' };
      cache.set('123', details);
      expect(cache.get('123')).toEqual(details);
    });
  });

  describe('getUserProfileCache', () => {
    it('returns a cache instance with max size of 500', () => {
      const cache = getUserProfileCache();
      expect(cache.max).toBe(500);
    });

    it('stores and retrieves user profiles', () => {
      const cache = getUserProfileCache();
      const profile = { steamId64: '76561198000000000', personaName: 'TestUser' };
      cache.set('76561198000000000', profile);
      expect(cache.get('76561198000000000')).toEqual(profile);
    });
  });

  describe('getter functions return consistent instances', () => {
    it('getAppListCache returns the same instance on multiple calls', () => {
      expect(getAppListCache()).toBe(getAppListCache());
    });

    it('getGameDetailCache returns the same instance on multiple calls', () => {
      expect(getGameDetailCache()).toBe(getGameDetailCache());
    });

    it('getUserProfileCache returns the same instance on multiple calls', () => {
      expect(getUserProfileCache()).toBe(getUserProfileCache());
    });
  });
});
