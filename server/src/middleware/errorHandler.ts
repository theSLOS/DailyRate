/**
 * Express error-handling middleware — the last thing registered in
 * app.ts. Serializes AppError into the standard `{ error }` shape, and
 * anything unexpected into a generic 500.
 */
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors.js';

/** Converts a thrown/next(err) error into the standard `{ error: { code, message } }` JSON response. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    req.log?.warn({ err }, err.message);
    res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
    return;
  }

  req.log?.error({ err }, 'unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
}
