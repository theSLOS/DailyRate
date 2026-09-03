/**
 * Shared fetch wrapper for every hook that talks to the front server:
 * attaches the caller's Supabase JWT, and normalizes both the front
 * server's `{ error: { code, message } }` shape and empty (204) responses
 * into a single `ApiError`-throwing contract.
 */
import { supabase } from '@/lib/supabase';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL!; // set in .env, required — see .env.example

type ApiErrorBody = { error: { code: string; message: string } };

// mirrors the front server's AppError shape (server/src/lib/errors.ts) —
// hooks that used to type their query error as PostgrestError now type it as
// this instead, the same way every proxied endpoint replaces one error shape
// with the other
/** Error thrown by every apiX call when the front server responds with a non-2xx status. */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

/** Builds the Bearer Authorization header from the current Supabase session, or throws if signed out. */
async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'No active session');
  }
  return { Authorization: `Bearer ${token}` };
}

/** Turns a raw fetch Response into parsed JSON, or throws an ApiError for a non-2xx/empty response. */
async function parseResponse<T>(res: Response): Promise<T> {
  // 204 No Content has no body to parse — the like/unlike routes return this
  // deliberately, since there's nothing meaningful to send back
  if (res.status === 204) {
    return undefined as T;
  }

  const body: unknown = await res.json();
  if (!res.ok) {
    const err = (body as Partial<ApiErrorBody>).error;
    throw new ApiError(res.status, err?.code ?? 'UNKNOWN', err?.message ?? 'Request failed');
  }
  return body as T;
}

/** Authenticated DELETE against the front server. */
export async function apiDelete<T>(path: string): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(`${API_BASE_URL}${path}`, { method: 'DELETE', headers });
  return parseResponse<T>(res);
}

/** Authenticated GET against the front server. */
export async function apiGet<T>(path: string): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(`${API_BASE_URL}${path}`, { headers });
  return parseResponse<T>(res);
}

/** Authenticated PUT against the front server, no request body. */
export async function apiPut<T>(path: string): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(`${API_BASE_URL}${path}`, { method: 'PUT', headers });
  return parseResponse<T>(res);
}

/** Authenticated POST against the front server with a JSON request body. */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseResponse<T>(res);
}
