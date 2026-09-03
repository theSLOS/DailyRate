/**
 * Builds the Express app: middleware order (logging -> CORS -> JSON body
 * parsing -> per-route auth), the full route mount table, and the
 * last-registered error handler.
 */
import cors from 'cors';
import express, { Express } from 'express';
import { requestLogger } from './middleware/requestLogger.js';
import { requireAuth } from './middleware/requireAuth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { meRouter } from './routes/me.js';
import { feedRouter } from './routes/feed.js';
import { postsRouter } from './routes/posts.js';
import { blocksRouter } from './routes/blocks.js';
import { friendsRouter } from './routes/friends.js';
import { profilesRouter } from './routes/profiles.js';
import { regionRouter } from './routes/region.js';

/** Assembles and returns the configured Express app (not yet listening). */
export function createApp(): Express {
  const app = express();

  app.use(requestLogger); // 1st: every request gets logged, success or fail
  // wide open deliberately, dev-only: the client sends a Bearer JWT, never a
  // cookie, so there's no CSRF surface for a permissive origin to open up —
  // revisit before this server is ever deployed somewhere real
  app.use(cors());
  app.use(express.json()); // parses JSON bodies — not used by GET /api/me/profile
  // yet, but every write endpoint from Concept 7 onward
  // needs it, cheap to add now

  app.use('/api/me', requireAuth, meRouter); // requireAuth runs BEFORE the route handler —
  // rejects with 401 before meRouter ever sees
  // a request with no/bad token

  app.use('/api/feed', requireAuth, feedRouter);
  app.use('/api/posts', requireAuth, postsRouter);
  app.use('/api/blocks', requireAuth, blocksRouter);
  app.use('/api/friends', requireAuth, friendsRouter);
  app.use('/api/profiles', requireAuth, profilesRouter);
  app.use('/api/region', requireAuth, regionRouter);

  app.use(errorHandler); // MUST be registered LAST — Express recognizes
  // error-handling middleware by its 4-arg signature
  // (err, req, res, next) and only routes to it when
  // something upstream calls next(err) or throws

  return app;
}
