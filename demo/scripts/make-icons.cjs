// Renders the PNG app icons from the SVG design with Playwright's Chromium.
// Run: npm run icons   (writes public/apple-touch-icon.png, icon-192.png, icon-512.png, icon-maskable-512.png)
const { chromium } = require("@playwright/test");
const path = require("node:path");

const INK = "#18343b", AQUA = "#9fe8dd", PAPER = "#fbf8f2";
// The mark (time ring + clock hand) on a 512 grid; `scale` shrinks it for the maskable safe zone.
const mark = (scale = 1) => `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
  <circle cx="256" cy="256" r="150" fill="none" stroke="${AQUA}" stroke-width="36" stroke-dasharray="620 400" stroke-linecap="round" transform="rotate(-90 256 256)"/>
  <path d="M256 156v100l64 40" fill="none" stroke="${PAPER}" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"/></g>`;
const svg = ({ rounded, scale }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ""} fill="${INK}"/>${mark(scale)}</svg>`;

const ICONS = [
  { file: "apple-touch-icon.png", size: 180, rounded: false, scale: 1, opaque: true },   // iOS rounds the corners itself
  { file: "icon-192.png", size: 192, rounded: true, scale: 1 },
  { file: "icon-512.png", size: 512, rounded: true, scale: 1 },
  { file: "icon-maskable-512.png", size: 512, rounded: false, scale: 0.72, opaque: true }, // content inside the 80% safe zone
];

(async () => {
  const browser = await chromium.launch();
  for (const ic of ICONS) {
    const page = await browser.newPage({ viewport: { width: ic.size, height: ic.size }, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg(ic)}</body></html>`);
    await page.screenshot({ path: path.join(__dirname, "..", "public", ic.file), omitBackground: !ic.opaque });
    await page.close();
    console.log("wrote public/" + ic.file);
  }
  await browser.close();
})();
