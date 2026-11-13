/// <reference types="vitest" />
import { defineConfig, type Plugin } from "vite";
import preact from "@preact/preset-vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.resolve(here, "../api");

// The engine, locations and adapter in api/ are CommonJS scripts shared with Node (server, examples) and the
// watch prototype. This plugin wraps them as ES modules at build time, so the demo imports them unchanged.
function apiCommonJs(): Plugin {
  return {
    name: "gotime-api-commonjs",
    enforce: "pre",
    transform(code, id) {
      const file = id.split("?")[0];
      if (!file.startsWith(API_DIR + path.sep) || !file.endsWith(".js")) return null;
      const deps: string[] = [];
      for (const m of code.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) if (!deps.includes(m[1])) deps.push(m[1]);
      const imports = deps.map((d, i) => `import __dep${i} from ${JSON.stringify(d)};`).join("\n");
      const table = deps.map((d, i) => `${JSON.stringify(d)}: __dep${i}`).join(", ");
      return {
        code: `${imports}
const module = { exports: {} }; let exports = module.exports;
const require = (p) => { const m = ({ ${table} })[p]; if (m === undefined) throw new Error("Not bundled: " + p); return m; };
${code}
export default module.exports;
`,
        map: null,
      };
    },
  };
}

export default defineConfig({
  // GitHub Pages serves the repo under /<repo>/; override with DEMO_BASE in the Pages workflow.
  base: process.env.DEMO_BASE ?? "./",
  resolve: { alias: { "@gotime/api": API_DIR } },
  server: { fs: { allow: [here, API_DIR] } },
  plugins: [
    apiCommonJs(),
    preact(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "GOTime demo",
        short_name: "GOTime",
        description: "When to run, how hard and which way to start: the GOTime runner journey.",
        theme_color: "#18343b",
        background_color: "#fbf8f2",
        display: "standalone",
        orientation: "portrait",
        start_url: ".",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
      },
      workbox: { globPatterns: ["**/*.{js,css,html,svg,woff2}"] },
    }),
  ],
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
