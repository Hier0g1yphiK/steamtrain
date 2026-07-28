import { LRUCache } from 'lru-cache';

// App list cache: single entry, refreshed every 24 hours
const appListCache = new LRUCache({
  max: 1,
  ttl: 24 * 60 * 60 * 1000, // 24 hours
  allowStale: true,
});

// Game detail cache: up to 1000 entries, refreshed every hour
const gameDetailCache = new LRUCache({
  max: 1000,
  ttl: 60 * 60 * 1000, // 1 hour
  allowStale: true,
});

// User profile cache: up to 500 entries, refreshed every 5 minutes
const userProfileCache = new LRUCache({
  max: 500,
  ttl: 5 * 60 * 1000, // 5 minutes
  allowStale: true,
});

// IGDB game cache: up to 500 entries, refreshed every hour
const igdbCache = new LRUCache({
  max: 500,
  ttl: 60 * 60 * 1000, // 1 hour
  allowStale: true,
});

export function getAppListCache() {
  return appListCache;
}

export function getGameDetailCache() {
  return gameDetailCache;
}

export function getUserProfileCache() {
  return userProfileCache;
}

export function getIgdbCache() {
  return igdbCache;
}
