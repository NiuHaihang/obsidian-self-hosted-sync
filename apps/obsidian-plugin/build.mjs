import { mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { build } from "esbuild";

const thisFile = fileURLToPath(import.meta.url);
const pluginRoot = dirname(thisFile);
const distDir = resolve(pluginRoot, "dist");

await mkdir(distDir, { recursive: true });

await build({
  entryPoints: [resolve(pluginRoot, "src/obsidian-entry.ts")],
  outfile: resolve(distDir, "main.js"),
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "es2020",
  sourcemap: false,
  external: ["obsidian", "electron", "@codemirror/state", "@codemirror/view", "@codemirror/language"]
});

await copyFile(resolve(pluginRoot, "manifest.json"), resolve(distDir, "manifest.json"));
