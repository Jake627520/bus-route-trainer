/**
 * Change 51: 產生 PWA 圖示（可重現）。
 * 用 Playwright 內建的 Chromium 把下面的 SVG 轉成 PNG，輸出到 public/。
 *   node scripts/generate-pwa-icons.mjs
 * 想用別的 Chromium：CHROMIUM_PATH=/path/to/chrome node scripts/generate-pwa-icons.mjs
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const NAVY = '#242b4c';
const PINK = '#ef60a3';

/** 路線意象：白色路線連接出發站（白）與終點站（粉紅）。viewBox 512。 */
const glyph = `
  <path d="M150 372 C150 300 362 300 362 232 L362 160" fill="none" stroke="#fff" stroke-width="28" stroke-linecap="round"/>
  <circle cx="150" cy="372" r="34" fill="#fff"/>
  <circle cx="256" cy="298" r="24" fill="#fff" stroke="${NAVY}" stroke-width="9"/>
  <circle cx="362" cy="160" r="42" fill="${PINK}" stroke="#fff" stroke-width="12"/>`;

/** any：圓角方形（四角透明）。maskable：滿版底色，圖案縮到安全區（中間 80%）。 */
const svgAny = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="112" fill="${NAVY}"/>${glyph}</svg>`;
const svgMaskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="${NAVY}"/>
  <g transform="translate(256 256) scale(0.78) translate(-256 -256)">${glyph}</g></svg>`;
const svgApple = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="${NAVY}"/>
  <g transform="translate(256 256) scale(0.9) translate(-256 -256)">${glyph}</g></svg>`;

const jobs = [
  { file: 'icon-192.png', size: 192, svg: svgAny, transparent: true },
  { file: 'icon-512.png', size: 512, svg: svgAny, transparent: true },
  { file: 'icon-maskable-512.png', size: 512, svg: svgMaskable, transparent: false },
  { file: 'apple-touch-icon.png', size: 180, svg: svgApple, transparent: false },
];

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const out = path.resolve(process.cwd(), 'public');
for (const { file, size, svg, transparent } of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace(
      /width="512" height="512"/,
      `width="${size}" height="${size}"`,
    )}</body></html>`,
  );
  const buf = await page.screenshot({ omitBackground: transparent, type: 'png' });
  fs.writeFileSync(path.join(out, file), buf);
  console.log(`wrote public/${file} (${size}x${size})`);
  await page.close();
}
await browser.close();
