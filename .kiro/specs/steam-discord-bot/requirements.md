# Requirements Document

## Introduction

A Discord bot that provides Steam game and user lookup functionality via slash commands. Results are displayed as rich Discord embeds. The bot is designed as the first phase of a modular system that will grow additional commands over time, so the architecture prioritizes extensibility and clean separation of concerns.

## Glossary

- **Bot**: The Discord bot application that registers and responds to slash commands
- **Command_Registry**: The modular system that maps slash command names to their handler implementations, enabling easy addition of new commands
- **Game_Search_Service**: The component responsible for resolving a game name to a Steam appid using the storefront search endpoint or the full app list as a fallback
- **Game_Details_Service**: The component responsible for fetching detailed game information from the Steam store API given an appid
- **User_Resolve_Service**: The component responsible for resolving user input (vanity URL, profile URL, or SteamID64) to a SteamID64
- **User_Profile_Service**: The component responsible for fetching Steam user profile data given a SteamID64
- **Cache**: An in-memory store that holds recent API responses for a configurable time-to-live (TTL) to reduce redundant external calls
- **Embed**: A Discord rich-content message format used to display structured information
- **SteamID64**: A unique 64-bit numeric identifier for a Steam user account
- **Vanity_URL**: A custom human-readable string chosen by a Steam user for their profile URL (e.g. `steamcommunity.com/id/username`)
- **Storefront_Search_Endpoint**: The Steam API at `store.steampowered.com/api/storesearch` used to search for games by name
- **App_List_Endpoint**: The Steam API at `ISteamApps/GetAppList` that returns the full list of Steam applications
- **GBP**: British Pound Sterling, the currency used for all price displays

## Requirements

### Requirement 1: Game Search by Name

**User Story:** As a Discord user, I want to search for a Steam game by name using a slash command, so that I can quickly look up game information without leaving Discord.

#### Acceptance Criteria

1. WHEN the user invokes `/game <name>` with a name between 1 and 200 characters, THE Game_Search_Service SHALL query the Storefront_Search_Endpoint with the provided name to find matching apps and return results within 5 seconds
2. IF the user invokes `/game` with an empty name or a name exceeding 200 characters, THEN THE Bot SHALL respond with a validation error message indicating the allowed name length
3. IF the Storefront_Search_Endpoint is unavailable or returns an error, THEN THE Game_Search_Service SHALL fall back to fuzzy-matching against the cached App_List_Endpoint data and return results within 5 seconds
4. WHEN a single match is found with a similarity score of 90% or above, THE Bot SHALL fetch and display the game details as an Embed
5. WHEN multiple plausible matches are found (2 or more with similarity score above 60%), THE Bot SHALL present up to the top 5 matches as an interactive selection component (buttons or select menu) allowing the user to choose the correct game
6. IF the user does not interact with the selection component within 30 seconds, THEN THE Bot SHALL disable the component and display a timeout message
7. IF no matches are found for the provided name (no results with similarity score above 60%), THEN THE Bot SHALL respond with a "no results found" message including the original search term
8. IF the Steam API call fails or does not respond within 5 seconds, THEN THE Bot SHALL respond with a user-friendly error message indicating the service is temporarily unavailable and preserve the user's original search term in the response

### Requirement 2: Game Details Display

**User Story:** As a Discord user, I want to see detailed information about a Steam game in a rich embed, so that I can quickly assess whether a game interests me.

#### Acceptance Criteria

1. WHEN a game is selected, THE Game_Details_Service SHALL fetch details from the Steam appdetails API with filters for price_overview, short_description, header_image, genres, release_date, developers, publishers, and metacritic using region code `gb`
2. THE Bot SHALL display an Embed containing: game title as embed title linking to the Steam store page (`https://store.steampowered.com/app/{appid}`), header image as embed image, short description (truncated to 300 characters if longer), genres as a comma-separated list, developer(s), publisher(s), and release date
3. WHEN the game is free-to-play, THE Bot SHALL display the price field as "Free to Play"
4. WHEN the game has an active discount, THE Bot SHALL display the original price with strikethrough formatting, the discounted price, and the discount percentage in GBP (e.g., "~~£39.99~~ £19.99 (-50%)")
5. WHEN the game has no active discount, THE Bot SHALL display the current price in GBP formatted with the £ symbol and two decimal places
6. IF the Steam appdetails API returns `success: false` or no data for the requested app ID, THEN THE Bot SHALL display a message indicating the game is not available in the selected region
7. IF the Steam appdetails API request fails due to a network error or returns an HTTP status code outside 200-299, THEN THE Bot SHALL display a message indicating that game details could not be retrieved and the user should try again
8. WHEN a Metacritic score is available for the game, THE Bot SHALL include the numeric score (0-100) in the Embed
9. WHEN no Metacritic score is available, THE Bot SHALL omit the Metacritic field from the Embed rather than showing an empty or placeholder value
10. IF the API response is not received within 10 seconds, THEN THE Bot SHALL display a message indicating the request timed out and the user should try again

### Requirement 3: Steam User Lookup

**User Story:** As a Discord user, I want to look up a Steam user profile via a slash command, so that I can view their public profile information.

#### Acceptance Criteria

1. WHEN the user invokes `/steamuser <query>` with a full Steam profile URL matching the pattern `https://steamcommunity.com/profiles/<steamid64>`, THE User_Resolve_Service SHALL extract the SteamID64 directly from the URL
2. WHEN the user invokes `/steamuser <query>` with a vanity URL matching the pattern `https://steamcommunity.com/id/<vanity_name>` or just a vanity name string, THE User_Resolve_Service SHALL resolve the SteamID64 via the `ISteamUser/ResolveVanityURL` API
3. WHEN the user invokes `/steamuser <query>` with a raw 17-digit numeric SteamID64, THE User_Resolve_Service SHALL validate it as a 17-digit number and use it directly without additional resolution
4. IF the input does not match any supported format (profile URL, vanity URL, vanity name, or 17-digit SteamID64), THEN THE Bot SHALL respond with a message explaining the accepted input formats
5. WHEN a SteamID64 is resolved, THE User_Profile_Service SHALL fetch the player summary via `ISteamUser/GetPlayerSummaries` within 10 seconds
6. WHEN the profile visibility is public (communityvisibilitystate = 3), THE User_Profile_Service SHALL also fetch the owned game count via `IPlayerService/GetOwnedGames`
7. THE Bot SHALL display a user Embed containing: persona name as embed title, avatar as embed thumbnail, profile URL as a clickable link, online status (Online, Offline, Away, Snooze, Looking to Trade, Looking to Play), account visibility (Public or Private), country (if available and profile is public), and game count (if the profile is public)
8. IF the vanity URL cannot be resolved (ResolveVanityURL returns success !== 1), THEN THE Bot SHALL respond with a message indicating the user was not found and suggest checking the spelling or trying a profile URL
9. IF the Steam API call fails or does not respond within 10 seconds, THEN THE Bot SHALL respond with a user-friendly error message indicating the service is temporarily unavailable
10. THE Bot SHALL include help text in the `/steamuser` command description explaining the accepted input formats: "Look up a Steam profile by profile URL, vanity name, or SteamID64"

### Requirement 4: Modular Command Architecture

**User Story:** As a developer, I want a modular command registration system, so that I can add new slash commands without modifying the core bot setup.

#### Acceptance Criteria

1. THE Command_Registry SHALL load command handlers from a dedicated commands directory where each command is defined in its own module file
2. WHEN the Bot starts, THE Command_Registry SHALL automatically discover and register all command modules found in the commands directory with Discord's REST API
3. WHEN a new command module is added to the commands directory, THE Command_Registry SHALL register it on the next Bot restart without requiring changes to other files
4. THE Command_Registry SHALL enforce that each command module exports a required interface containing: a command name (1–32 characters), a description (1–100 characters), an options definition, and an execute function
5. IF a command module fails to export the required interface or throws an error during loading, THEN THE Command_Registry SHALL skip that module, log an error message indicating the module path and failure reason, and continue loading remaining modules
6. IF two or more command modules define the same command name, THEN THE Command_Registry SHALL reject the duplicate module, log an error message indicating the conflicting module path, and register only the first-loaded module with that name

### Requirement 5: Caching

**User Story:** As a bot operator, I want API responses to be cached, so that repeated lookups do not result in excessive external API calls.

#### Acceptance Criteria

1. THE Cache SHALL store responses from the App_List_Endpoint with a TTL of 24 hours
2. THE Cache SHALL store game detail responses with a TTL of 1 hour
3. THE Cache SHALL store user profile responses with a TTL of 5 minutes
4. WHEN a cached entry exists and has not expired, THE Bot SHALL serve the cached response instead of making a new API call
5. WHEN a cached entry has expired and a fresh API fetch succeeds, THE Cache SHALL replace the expired entry with the new response and THE Bot SHALL serve the new response
6. IF a cached entry has expired and the fresh API fetch fails, THEN THE Bot SHALL serve the expired cached response and log a warning indicating the fetch failure
7. THE Cache SHALL retain a maximum of 1000 game detail entries and 500 user profile entries, evicting the least-recently-used entry when the limit is reached
8. WHEN the App_List_Endpoint response is cached, THE Cache SHALL store it as a single entry and evict the previous version upon successful refresh

### Requirement 6: Secrets Management

**User Story:** As a bot operator, I want sensitive credentials loaded from environment variables, so that secrets are never exposed in source code.

#### Acceptance Criteria

1. THE Bot SHALL load the Discord bot token from the environment variable `DISCORD_TOKEN`
2. THE Bot SHALL load the Steam Web API key from the environment variable `STEAM_API_KEY`
3. THE Bot SHALL support loading environment variables from a `.env` file located in the project root directory, where values defined in the `.env` file do not override already-set environment variables
4. IF a required environment variable (`DISCORD_TOKEN` or `STEAM_API_KEY`) is missing or empty at startup, THEN THE Bot SHALL exit with a non-zero exit code and log an error message to standard error that identifies each missing variable by name
5. THE Bot SHALL include a `.env.example` file in the project root documenting all required environment variables (`DISCORD_TOKEN`, `STEAM_API_KEY`) with placeholder values and no actual secrets
6. THE Bot SHALL NOT log, print, or include secret values in any output, error message, or stack trace

### Requirement 7: Error Handling and Resilience

**User Story:** As a Discord user, I want the bot to handle failures gracefully, so that I always receive a meaningful response even when external services are unavailable.

#### Acceptance Criteria

1. THE Bot SHALL set a timeout of 10 seconds on all external HTTP requests to Steam APIs
2. THE Bot SHALL defer the interaction reply before initiating any external API call
3. IF an external API call exceeds the 10-second timeout, THEN THE Bot SHALL respond to the user with a message indicating the request timed out and that the user may retry
4. IF an external API returns an HTTP status code outside the 200–299 range, THEN THE Bot SHALL log the status code and response body (up to 1024 characters) and respond with a generic failure message to the user
5. IF an external API returns a response body that cannot be parsed or is missing expected fields, THEN THE Bot SHALL log the raw response (up to 1024 characters) and respond with a generic failure message to the user
6. THE Bot SHALL catch all unhandled exceptions within command handlers and respond with a generic error message rather than crashing or failing silently
7. THE Bot SHALL log all errors with the command name, user-provided input parameters, error type, and error message within 1 second of the error occurring
8. IF the Bot has already deferred a reply and a failure occurs, THEN THE Bot SHALL edit the deferred reply with the error message rather than attempting a new response
