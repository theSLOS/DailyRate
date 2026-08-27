import { Router } from 'express';
import { getClientForRequest } from '../lib/supabaseClient.js';
import { AppError } from '../lib/errors.js';

export const regionRouter = Router();

// device location permission + GPS read stay entirely client-side (the server
// has no access to either) — this endpoint only proxies the resolve_region
// RPC once the client already has coordinates
regionRouter.get('/', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new AppError(400, 'INVALID_PARAM', 'lat and lng must both be numbers');
  }

  const client = getClientForRequest(req.jwt);
  const { data, error } = await client.rpc('resolve_region', { lng, lat });

  if (error) throw new AppError(502, 'SUPABASE_ERROR', error.message);
  res.json(data?.[0] ?? null);
});
