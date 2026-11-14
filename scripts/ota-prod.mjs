#!/usr/bin/env node
/**
 * Guarded production OTA publisher (ported from the Bloom app).
 *
 * Why: `eas update` bundles on this PC, and Expo loads .env.local (the DEV
 * Convex deployment used by `npx convex dev`) on top of .env. Metro also
 * caches inlined EXPO_PUBLIC_* values. Either one ships an OTA that makes
 * every installed app talk to DEV instead of PROD.
 *
 * What it does (nothing is published unless step 4 passes):
 *   1. Forces .env.local to the PROD Convex URLs (backs up the original).
 *   2. Wipes Expo/Metro caches so env values are re-inlined fresh.
 *   3. Exports the bundle with PROD URLs also set in process.env.
 *   4. Scans the bundles and ABORTS if the DEV deployment URL is
 *      present (or the PROD one is missing).
 *   5. Publishes that exact bundle (eas update --skip-bundler), then
 *      restores the original .env.local.
 *
 * Check only, no publish:  npm run ota:prod:check
 *
 * Usage:
 *   npm run ota:prod -- --message "My message"
 *   npm run ota:prod -- --message "My message" --platform ios
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PROD = "resilient-crocodile-943";
const DEV = "hidden-roadrunner-559";
const PROD_URL = `https://${PROD}.convex.cloud`;
const PROD_SITE_URL = `https://${PROD}.convex.site`;
const ENV_FILE = ".env.local";
const BACKUP_FILE = ".env.local.ota-backup";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const platform = arg("platform", "all");
if (!["all", "ios", "android"].includes(platform)) {
  console.error(`[ota-prod] --platform must be all, ios or android (got "${platform}")`);
  process.exit(1);
}
const message = arg("message", `Prod OTA ${new Date().toISOString()}`);

function log(msg) {
  console.log(`\n\x1b[36m[ota-prod]\x1b[0m ${msg}`);
}

function restore() {
  if (fs.existsSync(BACKUP_FILE)) {
    fs.writeFileSync(ENV_FILE, fs.readFileSync(BACKUP_FILE, "utf-8"));
    fs.rmSync(BACKUP_FILE, { force: true });
    log(`Restored original ${ENV_FILE}`);
  }
}

function fail(msg) {
  console.error(`\n\x1b[31m[ota-prod] ABORT:\x1b[0m ${msg}\n`);
  try { restore(); } catch { /* ignore */ }
  process.exit(1);
}

// A backup left by a crashed run holds the real .env.local: put it back first.
if (fs.existsSync(BACKUP_FILE)) {
  log(`Found leftover ${BACKUP_FILE} from an earlier run, restoring it first.`);
  restore();
}

// 1. Force PROD URLs in .env.local (it overrides .env when Expo loads env files)
if (fs.existsSync(ENV_FILE)) {
  const original = fs.readFileSync(ENV_FILE, "utf-8");
  fs.writeFileSync(BACKUP_FILE, original);
  const prodEnv = original
    .replace(new RegExp(`${DEV}\\.eu-west-1`, "g"), PROD)
    .replace(new RegExp(DEV, "g"), PROD)
    .replace(new RegExp(`dev:${PROD}`, "g"), `prod:${PROD}`);
  fs.writeFileSync(ENV_FILE, prodEnv);
  log(`Forced ${ENV_FILE} to PROD (${PROD}). Backup: ${BACKUP_FILE}`);
}

try {
  // 2. Wipe every cache that can hold a stale inlined env value.
  log("Clearing Expo/Metro/Babel caches...");
  for (const dir of [".expo", "dist", path.join("node_modules", ".cache")]) {
    fs.rmSync(path.join(process.cwd(), dir), { recursive: true, force: true });
  }
  try {
    const tmp = os.tmpdir();
    for (const entry of fs.readdirSync(tmp)) {
      if (/^(metro|haste|react-native)/i.test(entry)) {
        fs.rmSync(path.join(tmp, entry), { recursive: true, force: true });
      }
    }
  } catch {
    /* temp dir not readable, non-fatal */
  }

  // 3. Export the bundle locally. Values already in process.env win over
  //    .env files in Expo, so the PROD URLs are set here as a second guard.
  log(`Exporting bundle (platform=${platform})...`);
  execSync(`npx expo export --platform ${platform} --output-dir dist --dump-sourcemap --dump-assetmap --clear`, {
    stdio: "inherit",
    env: {
      ...process.env,
      EXPO_NO_CACHE: "1",
      NODE_ENV: "production",
      EXPO_PUBLIC_APP_ENV: "production",
      EXPO_PUBLIC_CONVEX_URL: PROD_URL,
      EXPO_PUBLIC_CONVEX_SITE_URL: PROD_SITE_URL,
    },
  });

  // 4. Verify the bundles BEFORE anything is published
  const platDirs = platform === "all" ? ["ios", "android"] : [platform];
  const devUrlRe = new RegExp(`${DEV}(\\.eu-west-1)?\\.convex\\.(cloud|site)`, "g");
  const prodUrlRe = new RegExp(`${PROD}\\.convex\\.(cloud|site)`, "g");
  for (const p of platDirs) {
    const jsDir = path.join("dist", "_expo", "static", "js", p);
    if (!fs.existsSync(jsDir)) fail(`No exported bundle dir for ${p} (${jsDir})`);
    const bundles = fs.readdirSync(jsDir).filter((f) => f.endsWith(".hbc") || f.endsWith(".js"));
    if (bundles.length === 0) fail(`No bundle file found in ${jsDir}`);
    for (const b of bundles) {
      const content = fs.readFileSync(path.join(jsDir, b), "latin1");
      const devCount = (content.match(devUrlRe) || []).length;
      const prodCount = (content.match(prodUrlRe) || []).length;
      log(`[${p}/${b}] PROD(${PROD})=${prodCount}  DEV(${DEV})=${devCount}`);
      if (devCount > 0) fail(`DEV Convex URL leaked into the ${p} bundle. Nothing was published.`);
      if (prodCount === 0) fail(`PROD Convex URL missing from the ${p} bundle. Nothing was published.`);
    }
  }
  log("\x1b[32mVerified: bundle points to PROD only.\x1b[0m");

  if (process.argv.includes("--dry-run")) {
    log("Dry run: bundle verified, skipping publish.");
  } else {
    // 5. Publish exactly the bundle that was just verified.
    log(`Publishing OTA -> branch=production platform=${platform}`);
    execSync(
      `npx eas-cli update --branch production --environment production --platform ${platform} --skip-bundler --input-dir dist --non-interactive --message ${JSON.stringify(message)}`,
      { stdio: "inherit" }
    );
    log("\x1b[32mOTA published.\x1b[0m");
  }
} finally {
  restore();
}
