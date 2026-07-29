/**
 * Sale Embed Builder
 * Creates a Discord embed for sale notifications.
 */

import { EmbedBuilder } from 'discord.js';

/**
 * Formats a price in pence to a GBP string.
 * @param {number} pence - Price in pence
 * @returns {string} Formatted price string (e.g. "£19.99")
 */
function formatPrice(pence) {
  return `£${(pence / 100).toFixed(2)}`;
}

/**
 * Builds a Discord embed for a sale notification.
 * @param {object} saleInfo
 * @param {number} saleInfo.appId - Steam app ID
 * @param {string} saleInfo.name - Game name
 * @param {number} saleInfo.currentPrice - Current price in pence
 * @param {number} saleInfo.originalPrice - Original price in pence
 * @param {number} saleInfo.discountPercent - Discount percentage
 * @returns {EmbedBuilder}
 */
export function buildSaleEmbed(saleInfo) {
  const { appId, name, currentPrice, originalPrice, discountPercent } = saleInfo;
  const storeUrl = `https://store.steampowered.com/app/${appId}`;
  const headerImage = `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;

  const embed = new EmbedBuilder()
    .setTitle(`🏷️ ${name} is on sale!`)
    .setURL(storeUrl)
    .setThumbnail(headerImage)
    .setColor(0x1b9e3e) // Steam green
    .addFields(
      {
        name: 'Price',
        value: `~~${formatPrice(originalPrice)}~~ **${formatPrice(currentPrice)}**`,
        inline: true,
      },
      {
        name: 'Discount',
        value: `-${discountPercent}%`,
        inline: true,
      },
      {
        name: 'Store Page',
        value: `[View on Steam](${storeUrl})`,
        inline: true,
      },
    )
    .setFooter({ text: 'Steam Sale Notification' })
    .setTimestamp();

  return embed;
}
