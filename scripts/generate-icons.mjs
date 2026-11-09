#!/usr/bin/env node
/**
 * Renders the PWA / favicon PNGs from inline SVG using Playwright's Chromium
 * (already a dev dependency for e2e tests). Run: npm run icons
 */
import { writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const mark = (stroke) =>
  `<path d="M18 44V20l14 14 14-14v24" fill="none" stroke="${stroke}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;

// Regular icon: rounded square. Maskable: full-bleed background, mark inside the 80% safe zone.
const regular = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0a0a0a"/>${mark('#facc15')}</svg>`;
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#0a0a0a"/><g transform="translate(12.8 12.8) scale(0.6)">${mark('#facc15')}</g></svg>`;
const apple = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#0a0a0a"/><g transform="translate(6.4 6.4) scale(0.8)">${mark('#facc15')}</g></svg>`;

const targets = [
  ['public/pwa-192.png', regular, 192],
  ['public/pwa-512.png', regular, 512],
  ['public/pwa-maskable-512.png', maskable, 512],
  ['public/apple-touch-icon.png', apple, 180],
  ['public/favicon-32.png', regular, 32],
];

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
const page = await browser.newPage();
for (const [file, svg, size] of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  await writeFile(
    file,
    await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }),
  );
  console.log('wrote', file);
}
await browser.close();

// favicon.ico = single 32px PNG wrapped in an ICO container.
const { readFile } = await import('node:fs/promises');
const png = await readFile('public/favicon-32.png');
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header.writeUInt8(32, 6);
header.writeUInt8(32, 7);
header.writeUInt8(0, 8);
header.writeUInt8(0, 9);
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(22, 18);
await writeFile('public/favicon.ico', Buffer.concat([header, png]));
const { unlink } = await import('node:fs/promises');
await unlink('public/favicon-32.png');
console.log('wrote public/favicon.ico');
