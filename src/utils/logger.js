/**
 * Structured logging utility for the Steam Discord bot.
 * Logs command, input, errorType, errorMessage fields.
 * Never includes secrets (DISCORD_TOKEN, STEAM_API_KEY).
 */

const SECRETS = new Set(['DISCORD_TOKEN', 'STEAM_API_KEY']);
const MAX_RESPONSE_BODY_LENGTH = 1024;

/**
 * Strips any secret values from a string.
 */
function redactSecrets(value) {
  if (typeof value !== 'string') return value;
  let redacted = value;
  for (const key of SECRETS) {
    const secretValue = process.env[key];
    if (secretValue && secretValue.trim() !== '') {
      redacted = redacted.replaceAll(secretValue, '[REDACTED]');
    }
  }
  return redacted;
}

/**
 * Sanitizes a log entry to remove secret values from all string fields.
 */
function sanitize(entry) {
  const clean = {};
  for (const [key, value] of Object.entries(entry)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      clean[key] = redactSecrets(value);
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      clean[key] = sanitize(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

/**
 * Truncates responseBody to MAX_RESPONSE_BODY_LENGTH characters.
 */
function truncateResponseBody(entry) {
  if (
    typeof entry.responseBody === 'string' &&
    entry.responseBody.length > MAX_RESPONSE_BODY_LENGTH
  ) {
    return {
      ...entry,
      responseBody: entry.responseBody.slice(0, MAX_RESPONSE_BODY_LENGTH),
    };
  }
  return entry;
}

/**
 * Builds a structured log entry from an error context.
 */
function buildLogEntry({ command, input, error, statusCode, responseBody }) {
  const entry = {
    timestamp: new Date().toISOString(),
    command,
    input,
    errorType: error?.constructor?.name || error?.name || 'Unknown',
    errorMessage: error?.message || 'Unknown error',
  };

  if (statusCode !== undefined) {
    entry.statusCode = statusCode;
  }

  if (responseBody !== undefined) {
    entry.responseBody = responseBody;
  }

  // Also pull statusCode/responseBody from error if it has them
  if (error?.statusCode !== undefined && entry.statusCode === undefined) {
    entry.statusCode = error.statusCode;
  }
  if (error?.responseBody !== undefined && entry.responseBody === undefined) {
    entry.responseBody = error.responseBody;
  }

  return truncateResponseBody(entry);
}

export const logger = {
  error(context) {
    const entry = buildLogEntry(context);
    const sanitized = sanitize(entry);
    console.error(JSON.stringify(sanitized));
  },

  warn(context) {
    const entry =
      typeof context === 'string'
        ? { timestamp: new Date().toISOString(), message: context }
        : { timestamp: new Date().toISOString(), ...context };
    const sanitized = sanitize(entry);
    console.warn(JSON.stringify(sanitized));
  },

  info(context) {
    const entry =
      typeof context === 'string'
        ? { timestamp: new Date().toISOString(), message: context }
        : { timestamp: new Date().toISOString(), ...context };
    const sanitized = sanitize(entry);
    console.info(JSON.stringify(sanitized));
  },
};
