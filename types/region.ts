/**
 * Region-resolution types. Hand-written rather than derived from
 * `Database['public']['Functions']['resolve_region']`, whose generated
 * `Returns` type states `state_code` as non-null — `resolve_region`
 * genuinely returns null there for the ~168 countries with no admin-1
 * boundary rows.
 */
export type Region = {
  countryCode: string;
  stateCode: string | null;
  placeLabel: string;
};

export type RegionResult =
  | { status: 'resolved'; region: Region }
  | { status: 'unavailable'; reason: 'permission-denied' | 'no-match' };
