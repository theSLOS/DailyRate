/**
 * Validates and parses GET /api/feed's query string into a ParsedFeedQuery
 * — every invalid combination throws a 400 INVALID_PARAM rather than
 * silently falling back, since an accepted-but-ignored param would let one
 * logical query get cached under several different keys.
 */
import type { Request } from 'express';
import { AppError } from './errors.js';
import {
  DEFAULT_PAGE_SIZE,
  FEED_VARIANTS,
  MAX_PAGE_SIZE,
  REGION_REGEX,
  REGION_VARIANTS,
} from '../constants/feed.js';
import type { FeedVariant, ParsedFeedQuery } from '../types/feed.js';

type Query = Request['query'];

/** Builds a 400 INVALID_PARAM AppError with the given message. */
function invalid(message: string): AppError {
  return new AppError(400, 'INVALID_PARAM', message);
}

// express parses a repeated param into an array, so a cast here would let
// ?variant=newest&variant=state through as a value that is not a single string
/** Reads a single-valued query param, rejecting a repeated one. */
function readOne(query: Query, key: string): string | null {
  const raw = query[key];
  if (raw === undefined) return null;
  if (typeof raw !== 'string') throw invalid(`${key} must appear at most once`);
  return raw;
}

/** Narrows a string to FeedVariant if it's one of the known variants. */
function isFeedVariant(value: string): value is FeedVariant {
  return (FEED_VARIANTS as readonly string[]).includes(value);
}

/** Whether the given variant is one of the region-scoped ones (state/country). */
function isRegionVariant(variant: FeedVariant): boolean {
  return (REGION_VARIANTS as readonly string[]).includes(variant);
}

/** Parses and validates the required `variant` param. */
function parseVariant(query: Query): FeedVariant {
  const raw = readOne(query, 'variant');
  if (raw === null || !isFeedVariant(raw)) {
    throw invalid(`variant must be one of: ${FEED_VARIANTS.join(', ')}`);
  }
  return raw;
}

// rejected rather than ignored on the non-region variants: from Concept 4 the
// Redis key is derived from this parsed object, and an accepted-but-ignored
// param is how one blob ends up stored under several keys
/** Parses and validates `region`, required for region-scoped variants and disallowed otherwise. */
function parseRegionCode(query: Query, variant: FeedVariant): string | null {
  const raw = readOne(query, 'region');

  if (!isRegionVariant(variant)) {
    if (raw !== null) throw invalid('region is only valid for the state and country feeds');
    return null;
  }

  if (raw === null || raw.trim() === '') {
    throw invalid('region is required for the state and country feeds');
  }
  if (!REGION_REGEX.test(raw)) {
    throw invalid('region must be 1-16 characters of A-Z, a-z, 0-9, or -');
  }
  return raw;
}

/** Parses and validates the optional `cursor` param (disallowed for most_liked). */
function parseCursor(query: Query, variant: FeedVariant): string | null {
  const raw = readOne(query, 'cursor');
  if (raw === null) return null;

  if (variant === 'most_liked') throw invalid('cursor is not valid for the most_liked feed');
  if (Number.isNaN(Date.parse(raw))) throw invalid('cursor must be a valid ISO 8601 date string');

  return new Date(raw).toISOString();
}

/** Parses and validates the optional `limit` param, defaulting to DEFAULT_PAGE_SIZE. */
function parseLimit(query: Query): number {
  const raw = readOne(query, 'limit');
  if (raw === null) return DEFAULT_PAGE_SIZE;

  // Number('') is 0 and Number('20abc') is NaN — parseInt would read '20abc' as 20
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
    throw invalid(`limit must be an integer between 1 and ${MAX_PAGE_SIZE}`);
  }
  return value;
}

/** Parses and validates every GET /api/feed query param into a ParsedFeedQuery. */
export function parseFeedQuery(query: Query): ParsedFeedQuery {
  const variant = parseVariant(query);

  return {
    variant,
    regionCode: parseRegionCode(query, variant),
    cursor: parseCursor(query, variant),
    limit: parseLimit(query),
  };
}
