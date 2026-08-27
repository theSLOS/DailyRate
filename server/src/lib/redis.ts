import { createClient } from 'redis';
import { logger } from './logger.js';
import { BACKOFF_STEP_MS, MAX_BACKOFF_MS } from '../constants/redis.js';

let client: ReturnType<typeof createClient> | null = null;

// the client retries on a backoff for as long as redis is unreachable and emits
// 'error' on every attempt, so an unguarded handler logs indefinitely
let outageLogged = false;

export function connectRedis(): void {
  const url = process.env.REDIS_URL;
  if (!url) {
    logger.info('no REDIS_URL, cache disabled');
    return;
  }
  client = createClient({
    url,
    disableOfflineQueue: true,
    socket: { reconnectStrategy: (retries) => Math.min(retries * BACKOFF_STEP_MS, MAX_BACKOFF_MS) },
  });

  client.on('error', (err) => {
    if (outageLogged) return;
    outageLogged = true;
    logger.error({ code: errorCode(err) }, 'redis unavailable, cache disabled');
  });
  client.on('ready', () => {
    outageLogged = false;
    logger.info('redis connected');
  });

  void client.connect().catch(() => {
    /* handled by the error listener */
  });
}

// exposes state the guards above already compute internally — added so tests
// can wait for a real connection instead of racing a fixed sleep against
// however long Docker's Redis takes to accept a socket
export function isRedisReady(): boolean {
  return client?.isReady ?? false;
}

export async function getCache<T>(key: string): Promise<T | null> {
  if (!client?.isReady) return null;
  try {
    const raw = await client.get(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch (err) {
    // swallowed deliberately: redis is not a source of truth here, so a read
    // failure has a correct fallback (treat it as a miss) rather than surfacing
    logger.error({ err }, 'redis get error');
    return null;
  }
}

export async function setCache(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!client?.isReady) return;
  try {
    await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch (err) {
    // swallowed deliberately: a failed write only costs a future cache miss
    logger.error({ err }, 'redis set error');
  }
}

// node-redis types the emitted error as Error, which carries no `code`
function errorCode(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string') {
    return err.code;
  }
  return 'UNKNOWN';
}
