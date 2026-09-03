/**
 * Decodes a caller's user id out of their JWT, for building "my own data"
 * queries — never used as an authorization decision on its own.
 */

// decodes the subject claim without verifying the signature — safe here
// because the id is only ever used to build a `.eq('user_id', ...)` filter on
// a query that still carries the real JWT; Postgres/PostgREST reject that
// query outright if the token is forged or expired, so this never becomes an
// authorization decision on its own
/** Extracts the `sub` claim (the user id) from a JWT, without verifying its signature. */
export function uidFromJwt(jwt: string): string {
  const payload: unknown = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString('utf8'));
  return (payload as { sub: string }).sub;
}
