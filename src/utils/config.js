import dotenv from 'dotenv';

dotenv.config();

const required = ['DISCORD_TOKEN', 'DISCORD_APPLICATION_ID', 'STEAM_API_KEY', 'TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET'];

const missing = required.filter(
  (key) => !process.env[key] || process.env[key].trim() === ''
);

if (missing.length > 0) {
  process.stderr.write(
    `Error: Missing required environment variables: ${missing.join(', ')}\n`
  );
  process.exit(1);
}

export const config = {
  discordToken: process.env.DISCORD_TOKEN,
  discordApplicationId: process.env.DISCORD_APPLICATION_ID,
  steamApiKey: process.env.STEAM_API_KEY,
  twitchClientId: process.env.TWITCH_CLIENT_ID,
  twitchClientSecret: process.env.TWITCH_CLIENT_SECRET,
};
