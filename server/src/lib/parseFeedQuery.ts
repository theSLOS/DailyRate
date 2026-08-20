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

function invalid(message: string): AppError {
  return new AppError(400, 'INVALID_PARAM', message);
}

// express parses a repeated param into an array, so a cast here would let
// ?variant=newest&variant=state through as a value that is not a single string
function readOne(query: Query, key: string): string | null {
  const raw = query[key];
  if (raw === undefined) return null;
  if (typeof raw !== 'string') throw invalid(`${key} must appear at most once`);
  return raw;
}

function isFeedVariant(value: string): value is FeedVariant {
  return (FEED_VARIANTS as readonly string[]).includes(value);
}

function isRegionVariant(variant: FeedVariant): boolean {
  return (REGION_VARIANTS as readonly string[]).includes(variant);
}

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

function parseCursor(query: Query, variant: FeedVariant): string | null {
  const raw = readOne(query, 'cursor');
  if (raw === null) return null;

  if (variant === 'most_liked') throw invalid('cursor is not valid for the most_liked feed');
  if (Number.isNaN(Date.parse(raw))) throw invalid('cursor must be a valid ISO 8601 date string');

  return new Date(raw).toISOString();
}

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

export function parseFeedQuery(query: Query): ParsedFeedQuery {
  const variant = parseVariant(query);

  return {
    variant,
    regionCode: parseRegionCode(query, variant),
    cursor: parseCursor(query, variant),
    limit: parseLimit(query),
  };
}
