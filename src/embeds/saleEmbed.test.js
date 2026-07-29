/**
 * Unit tests for Sale Embed Builder
 */

import { describe, it, expect } from 'vitest';
import { buildSaleEmbed } from './saleEmbed.js';

describe('buildSaleEmbed', () => {
  const baseSaleInfo = {
    appId: 730,
    name: 'Counter-Strike 2',
    currentPrice: 1049,
    originalPrice: 1399,
    discountPercent: 25,
  };

  it('creates an embed with the correct title', () => {
    const embed = buildSaleEmbed(baseSaleInfo);
    const json = embed.toJSON();
    expect(json.title).toBe('🏷️ Counter-Strike 2 is on sale!');
  });

  it('sets the store URL', () => {
    const embed = buildSaleEmbed(baseSaleInfo);
    const json = embed.toJSON();
    expect(json.url).toBe('https://store.steampowered.com/app/730');
  });

  it('sets the thumbnail to the game header image', () => {
    const embed = buildSaleEmbed(baseSaleInfo);
    const json = embed.toJSON();
    expect(json.thumbnail.url).toBe('https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg');
  });

  it('displays the price with strikethrough original and bold current', () => {
    const embed = buildSaleEmbed(baseSaleInfo);
    const json = embed.toJSON();
    const priceField = json.fields.find((f) => f.name === 'Price');
    expect(priceField.value).toBe('~~£13.99~~ **£10.49**');
  });

  it('displays the discount percentage', () => {
    const embed = buildSaleEmbed(baseSaleInfo);
    const json = embed.toJSON();
    const discountField = json.fields.find((f) => f.name === 'Discount');
    expect(discountField.value).toBe('-25%');
  });

  it('includes a link to the store page', () => {
    const embed = buildSaleEmbed(baseSaleInfo);
    const json = embed.toJSON();
    const storeField = json.fields.find((f) => f.name === 'Store Page');
    expect(storeField.value).toBe('[View on Steam](https://store.steampowered.com/app/730)');
  });

  it('uses Steam green color', () => {
    const embed = buildSaleEmbed(baseSaleInfo);
    const json = embed.toJSON();
    expect(json.color).toBe(0x1b9e3e);
  });

  it('sets the footer', () => {
    const embed = buildSaleEmbed(baseSaleInfo);
    const json = embed.toJSON();
    expect(json.footer.text).toBe('Steam Sale Notification');
  });

  it('includes a timestamp', () => {
    const embed = buildSaleEmbed(baseSaleInfo);
    const json = embed.toJSON();
    expect(json.timestamp).toBeDefined();
  });
});
