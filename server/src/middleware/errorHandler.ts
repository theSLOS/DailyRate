import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors.js';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    req.log?.warn({ err }, err.message);
    res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
    return;
  }

  req.log?.error({ err }, 'unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
}
