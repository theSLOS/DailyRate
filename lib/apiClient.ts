import { supabase } from '@/lib/supabase';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL!; // set in .env, required — see .env.example

type ApiErrorBody = { error: { code: string; message: string } };

// mirrors the front server's AppError shape (server/src/lib/errors.ts) —
// hooks that used to type their query error as PostgrestError now type it as
// this instead, the same way every proxied endpoint replaces one error shape
// with the other
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'No active session');
  }
  return { Authorization: `Bearer ${token}` };
}

async function parseResponse<T>(res: Response): Promise<T> {
  const body: unknown = await res.json();
  if (!res.ok) {
    const err = (body as Partial<ApiErrorBody>).error;
    throw new ApiError(res.status, err?.code ?? 'UNKNOWN', err?.message ?? 'Request failed');
  }
  return body as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(`${API_BASE_URL}${path}`, { headers });
  return parseResponse<T>(res);
}
