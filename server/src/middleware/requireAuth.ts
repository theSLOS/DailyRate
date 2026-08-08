import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors.js';

declare global {
  namespace Express {
    interface Request {
      jwt: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const [scheme, token] = header?.split(' ') ?? [];

  if (scheme !== 'Bearer' || !token) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Missing or malformed Authorization header'));
    return;
  }

  req.jwt = token;
  next();
}
