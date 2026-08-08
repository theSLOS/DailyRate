import express, { Express } from 'express';
import { requestLogger } from './middleware/requestLogger.js';
import { requireAuth } from './middleware/requireAuth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { meRouter } from './routes/me.js';

export function createApp(): Express {
  const app = express();

  app.use(requestLogger); // 1st: every request gets logged, success or fail
  app.use(express.json()); // parses JSON bodies — not used by GET /api/me/profile
  // yet, but every write endpoint from Concept 7 onward
  // needs it, cheap to add now

  app.use('/api/me', requireAuth, meRouter); // requireAuth runs BEFORE the route handler —
  // rejects with 401 before meRouter ever sees
  // a request with no/bad token

  app.use(errorHandler); // MUST be registered LAST — Express recognizes
  // error-handling middleware by its 4-arg signature
  // (err, req, res, next) and only routes to it when
  // something upstream calls next(err) or throws

  return app;
}
