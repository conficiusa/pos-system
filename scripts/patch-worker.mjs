#!/usr/bin/env node
/**
 * Post-build patch: stub out @vercel/og from the OpenNext worker bundle.
 *
 * Next.js embeds @vercel/og (OG image generation) in its server runtime.
 * OpenNext generates an externalImport() helper with a hardcoded
 * dynamic import("next/dist/compiled/@vercel/og/index.edge.js"), which causes
 * wrangler to bundle resvg.wasm (1.3 MB) + yoga.wasm (70 KB) + index.edge.js
 * (432 KB) into the worker — even though this app never uses OG images.
 *
 * This script replaces that import with Promise.resolve({}) so wrangler
 * never sees the WASM file references, saving ~870 KB gzip from the bundle.
 */

import { readFileSync, writeFileSync } from "node:fs";

const HANDLER = ".open-next/server-functions/default/handler.mjs";
const TARGET = 'import("next/dist/compiled/@vercel/og/index.edge.js")';
const STUB = "Promise.resolve({})";

let handler = readFileSync(HANDLER, "utf-8");
const occurrences = handler.split(TARGET).length - 1;

if (occurrences === 0) {
  console.warn(`[patch-worker] WARNING: could not find @vercel/og import in ${HANDLER}`);
  console.warn("[patch-worker] The bundle may have changed — verify the patch is still needed.");
  process.exit(0);
}

handler = handler.replaceAll(TARGET, STUB);
writeFileSync(HANDLER, handler);

console.log(
  `[patch-worker] Stubbed out ${occurrences} @vercel/og import(s) — removes ~1.8 MB from worker bundle`,
);
