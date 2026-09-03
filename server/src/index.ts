/**
 * Server entrypoint: loads env, connects Redis (best-effort), and starts
 * the HTTP listener.
 */
import 'dotenv/config'; // MUST be the very first import — everything
// below reads process.env, so config has to
// load before anything else runs

import { createApp } from './app.js';
import { logger } from './lib/logger.js';
import { connectRedis } from './lib/redis.js';

connectRedis();

const app = createApp();

const port = Number(process.env.PORT || 4000);

app.listen(port, () => logger.info({ port }, 'server started'));
