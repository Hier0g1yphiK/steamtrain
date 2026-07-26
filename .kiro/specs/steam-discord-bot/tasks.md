# Implementation Plan: Steam Discord Bot

## Overview

Build a Discord bot with Node.js 20+ and discord.js v14+ that provides Steam game and user lookup via slash commands. Implementation follows a bottom-up layered approach: project scaffolding → infrastructure → services → embeds → commands → registry → bot entry point.

## Tasks

- [x] 1. Project scaffolding and configuration
  - [x] 1.1 Create package.json, .env.example, and config module
    - Create `package.json` with `"type": "module"`, dependencies (discord.js, @discordjs/rest, lru-cache, dotenv), devDependencies (vitest, fast-check)
    - Create `.env.example` with `DISCORD_TOKEN=your_discord_token_here` and `STEAM_API_KEY=your_steam_api_key_here`
    - Create `src/utils/config.js` that loads dotenv, validates `DISCORD_TOKEN` and `STEAM_API_KEY` are present, exits with non-zero code if missing
    - Create `vitest.config.js` configured for ESM
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 1.2 Create custom error types and logger
    - Create `src/utils/errors.js` with error class hierarchy: `BotError`, `TimeoutError`, `ApiError`, `ParseError`, `GameNotFoundError`, `UserNotFoundError`, `InvalidInputError`, `RegionUnavailableError`
    - Create `src/utils/logger.js` with structured logging utility that logs command, input, errorType, errorMessage fields and never includes secrets
    - _Requirements: 7.4, 7.5, 7.7, 6.6_

- [x] 2. Infrastructure layer
  - [x] 2.1 Implement cache manager
    - Create `src/cache/cacheManager.js` using `lru-cache` with three instances: appListCache (max: 1, TTL: 24h), gameDetailCache (max: 1000, TTL: 1h), userProfileCache (max: 500, TTL: 5min)
    - Configure `allowStale: true` for stale-while-revalidate behavior
    - Export getter functions for each cache instance
    - _Requirements: 5.1, 5.2, 5.3, 5.7, 5.8_

  - [x] 2.2 Write property tests for cache (Properties 9, 10)
    - **Property 9: Cache TTL freshness** — For any cache entry stored with a given TTL, retrieval before TTL returns cached value; retrieval after TTL treats entry as stale
    - **Property 10: LRU eviction at capacity** — For any sequence of insertions exceeding max size, LRU entry is evicted and size never exceeds maximum
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.7**

  - [x] 2.3 Implement Steam API client
    - Create `src/api/steamClient.js` with `SteamClient` class
    - Implement methods: `searchStore(term, cc)`, `getAppDetails(appId, cc, filters)`, `getAppList()`, `resolveVanityURL(vanityName)`, `getPlayerSummaries(steamIds)`, `getOwnedGames(steamId)`
    - Use `AbortController` with 10-second timeout on all requests
    - Throw `TimeoutError` on abort, `ApiError` on non-2xx responses (truncate body to 1024 chars)
    - Integrate with cache manager for read/write caching
    - Implement stale-while-revalidate: on fetch failure with expired cache entry, return stale value and log warning
    - _Requirements: 7.1, 7.4, 7.5, 5.4, 5.5, 5.6_

  - [x] 2.4 Write property test for error log truncation (Property 11)
    - **Property 11: Error log truncation** — For any error response body, logged content is truncated to at most 1024 characters; user-facing response does not contain the raw body
    - **Validates: Requirements 7.4, 7.5**

- [x] 3. Checkpoint - Ensure infrastructure tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Service layer
  - [x] 4.1 Implement game search service
    - Create `src/services/gameSearch.js` with `GameSearchService` class
    - Query storefront search endpoint; on failure, fall back to fuzzy matching against cached app list
    - Implement threshold routing: single result ≥ 90% similarity → auto-select; 2+ results > 60% → return top 5 candidates; no results > 60% → return no matches
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.7_

  - [x] 4.2 Write property test for search threshold routing (Property 2)
    - **Property 2: Search result threshold routing** — For any non-empty list of results with similarity scores, the selection algorithm correctly auto-selects, returns candidates, or returns no results based on thresholds
    - **Validates: Requirements 1.4, 1.5, 1.7**

  - [x] 4.3 Implement game details service
    - Create `src/services/gameDetails.js` with `GameDetailsService` class
    - Fetch from Steam appdetails endpoint with filters: price_overview, short_description, header_image, genres, release_date, developers, publishers, metacritic
    - Use region code `gb` for GBP pricing
    - Map API response to `GameDetails` data model
    - Handle `success: false` response by throwing `RegionUnavailableError`
    - _Requirements: 2.1, 2.6, 2.7, 2.10_

  - [x] 4.4 Implement user resolve service
    - Create `src/services/userResolve.js` with `UserResolveService` class
    - Implement resolution order: profile URL → vanity URL → 17-digit SteamID64 → vanity name → throw InvalidInputError
    - Use regex patterns for URL format detection
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 4.5 Write property test for user input format detection (Property 5)
    - **Property 5: Steam user input format detection** — For any string input, the resolver correctly routes to direct extraction, vanity resolution, or direct SteamID64 use based on format
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [x] 4.6 Implement user profile service
    - Create `src/services/userProfile.js` with `UserProfileService` class
    - Fetch player summary via `getPlayerSummaries`
    - If profile is public (communityvisibilitystate === 3), also fetch owned game count
    - Map to `UserProfile` data model with online status mapping
    - _Requirements: 3.5, 3.6, 3.7_

- [x] 5. Checkpoint - Ensure service layer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Embed builders
  - [x] 6.1 Implement game embed builder
    - Create `src/embeds/gameEmbed.js` with `buildGameEmbed(gameDetails)` function
    - Include: title linked to store URL, header image, short description (≤ 300 chars), genres, developers, publishers, release date
    - Price formatting: "Free to Play" if free; "~~£X.XX~~ £Y.YY (-Z%)" if discounted; "£X.XX" otherwise
    - Include metacritic score only if non-null; omit field entirely if null
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.8, 2.9_

  - [x] 6.2 Write property tests for game embed (Properties 3, 4)
    - **Property 3: Game embed completeness** — For any valid GameDetails, the embed contains all required fields and conditionally includes/omits metacritic
    - **Property 4: Price display formatting** — For any GameDetails, price displays correctly for free-to-play, discounted, and full-price games
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.8, 2.9**

  - [x] 6.3 Implement user embed builder
    - Create `src/embeds/userEmbed.js` with `buildUserEmbed(userProfile)` function
    - Include: persona name as title, avatar as thumbnail, profile URL as link, online status, visibility
    - Conditionally include country and game count only if profile is public and values are non-null
    - _Requirements: 3.7_

  - [x] 6.4 Write property test for user embed completeness (Property 6)
    - **Property 6: User embed completeness** — For any valid UserProfile, the embed contains all required fields and conditionally includes country and game count
    - **Validates: Requirements 3.7**

- [x] 7. Command handlers
  - [x] 7.1 Implement /game command handler
    - Create `src/commands/game.js` exporting `command` object and `execute` function
    - Define command with name "game", description, and string option "name" (required, 1-200 chars)
    - Implement deferred reply pattern: `deferReply()` → service calls → `editReply()`
    - Handle single match (show embed), multiple matches (show selection component with 30s timeout), no matches
    - Map service errors to user-friendly messages via `editReply`
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 1.7, 1.8, 7.2, 7.6, 7.8_

  - [x] 7.2 Write property test for game name validation (Property 1)
    - **Property 1: Game name validation boundary** — For any string, validation accepts if trimmed length is 1-200 chars; rejects with error otherwise
    - **Validates: Requirements 1.1, 1.2**

  - [x] 7.3 Implement /steamuser command handler
    - Create `src/commands/steamuser.js` exporting `command` object and `execute` function
    - Define command with name "steamuser", description including accepted format help text, and string option "query" (required)
    - Implement deferred reply pattern
    - Resolve user → fetch profile → build embed → editReply
    - Map errors (UserNotFoundError, InvalidInputError, TimeoutError) to user-friendly messages
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.8, 3.9, 3.10, 7.2, 7.6, 7.8_

- [x] 8. Command registry and bot entry point
  - [x] 8.1 Implement command registry
    - Create `src/registry.js` that discovers all `.js` files in `src/commands/`
    - Validate each module exports `command` (name 1-32 chars, description 1-100 chars, options array) and `execute` function
    - Skip invalid modules with error logging
    - Detect duplicate command names — keep first, log error for duplicates
    - Register valid commands with Discord REST API
    - Store handlers in `Map<name, execute>` for runtime dispatch
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 8.2 Write property tests for command registry (Properties 7, 8)
    - **Property 7: Command module validation** — For any module shape, acceptance iff it exports valid command object and execute function
    - **Property 8: Duplicate command name detection** — For any set of modules with overlapping names, only the first is registered
    - **Validates: Requirements 4.4, 4.5, 4.6**

  - [x] 8.3 Implement bot entry point
    - Create `src/bot.js` with bot setup: client creation with required intents, `interactionCreate` event handler that dispatches to command registry, top-level error boundary
    - Create `src/index.js` as entry point: load dotenv via config, create bot, login with token
    - Wire all layers together: config → cache → steamClient → services → commands → registry → bot
    - _Requirements: 7.2, 7.6, 6.1, 6.2_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The bot uses ESM modules throughout (`"type": "module"` in package.json)
- All prices are displayed in GBP (£) as specified in requirements

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "2.3"] },
    { "id": 3, "tasks": ["2.2", "2.4", "4.1", "4.3", "4.4", "4.6"] },
    { "id": 4, "tasks": ["4.2", "4.5"] },
    { "id": 5, "tasks": ["6.1", "6.3"] },
    { "id": 6, "tasks": ["6.2", "6.4", "7.1", "7.3"] },
    { "id": 7, "tasks": ["7.2", "8.1"] },
    { "id": 8, "tasks": ["8.2", "8.3"] }
  ]
}
```
