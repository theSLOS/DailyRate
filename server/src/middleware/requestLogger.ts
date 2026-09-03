/**
 * Structured per-request logging middleware (endpoint, status, timing),
 * mounted first in app.ts so every request is logged regardless of outcome.
 */
import { pinoHttp } from 'pino-http';
import type { Request, Response } from 'express';
import { logger } from '../lib/logger.js';

// pino-http's generics default to Node's IncomingMessage/ServerResponse; they
// must be parameterised with Express's types for `originalUrl` to exist
export const requestLogger = pinoHttp<Request, Response>({
  logger,
  customProps: (req) => ({
    endpoint: req.originalUrl,
  }),
});
