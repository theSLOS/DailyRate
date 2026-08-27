import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

type CacheEntry = { accessToken: string; expiresAt: number }; // expiresAt: unix seconds
type Cache = Record<string, CacheEntry>;

// each Vitest test file runs in its own process (confirmed by distinct pids
// in Concept 4's own logs), so an in-memory cache wouldn't be shared across
// files — this has to be a real file on disk, gitignored, holding live
// session tokens rather than credentials
const CACHE_PATH = join(process.cwd(), 'tests', '.jwt-cache.local.json');

// a token that expires 5 seconds into a test run is as useless as one
// already expired — this margin is generous relative to how long any single
// test file actually takes to run
const EXPIRY_SAFETY_MARGIN_SECONDS = 120;

function readCache(): Cache {
  if (!existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as Cache;
  } catch {
    return {}; // a corrupt or half-written cache file is a miss, not a crash
  }
}

export function getCachedToken(email: string): string | null {
  const entry = readCache()[email];
  if (!entry) return null;

  const stillValid = entry.expiresAt - EXPIRY_SAFETY_MARGIN_SECONDS > Date.now() / 1000;
  return stillValid ? entry.accessToken : null;
}

export function cacheToken(email: string, accessToken: string, expiresAt: number): void {
  const cache = readCache();
  cache[email] = { accessToken, expiresAt };

  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}
