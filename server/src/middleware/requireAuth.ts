import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors.js';
import { uidFromJwt } from '../lib/jwt.js';

declare global {
  namespace Express {
    interface Request {
      jwt: string;
      // undefined, not rejected here, when the token doesn't even decode —
      // existing routes (e.g. GET /api/me/profile) are already tested to
      // surface a malformed token as a SUPABASE_ERROR from the real query,
      // not an auth failure at this layer, and that must keep working.
      // Routes that actually need this must check it themselves.
      userId: string | undefined;
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
  // decoded once here so every downstream "my own data" route (today's post,
  // history, friend requests, ...) gets it for free instead of re-decoding
  try {
    req.userId = uidFromJwt(token);
  } catch {
    req.userId = undefined;
  }
  next();
}

// for routes that actually need "my own id" (today's post, history, ...) —
// narrows req.userId from string | undefined so callers don't each repeat
// the same guard
export function requireUserId(req: Request): string {
  if (!req.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Missing or malformed Authorization header');
  }
  return req.userId;
}
