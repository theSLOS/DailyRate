import assert from 'node:assert';
import { getTestJwt, uidFromJwt } from './getTestJwt.js';
import { getCachedToken, cacheToken } from './jwtCache.js';

export type TestAccount = { email: string; password: string };
export type TestSession = TestAccount & { jwt: string; userId: string };

const SETUP_HINT = 'see server/.env.test.example';

// every dummy account shares one password, so the file stores it once rather
// than repeating it per account and implying a variability that doesn't exist
export function loadTestAccounts(): TestAccount[] {
  const password = process.env.TEST_ACCOUNT_PASSWORD;
  const emails = process.env.TEST_ACCOUNT_EMAILS;
  assert(password, `TEST_ACCOUNT_PASSWORD missing — ${SETUP_HINT}`);
  assert(emails, `TEST_ACCOUNT_EMAILS missing — ${SETUP_HINT}`);

  const accounts = emails
    .split(',')
    .map((email) => email.trim())
    .filter((email) => email.length > 0)
    .map((email) => ({ email, password }));

  assert(accounts.length > 0, `TEST_ACCOUNT_EMAILS is empty — ${SETUP_HINT}`);
  return accounts;
}

export function testAccounts(count: number): TestAccount[] {
  const all = loadTestAccounts();
  assert(
    all.length >= count,
    `this suite needs ${count} test accounts but only ${all.length} are configured — ${SETUP_HINT}`
  );
  return all.slice(0, count);
}

// checks the on-disk cache before ever hitting Supabase Auth — real sign-ins
// are what tripped the "sign-ups and sign-ins" rate limit, since every test
// file re-authenticates its own sessions with no cache shared between them
async function getJwt(email: string, password: string): Promise<string> {
  const cached = getCachedToken(email);
  if (cached) return cached;

  const { accessToken, expiresAt } = await getTestJwt(email, password);
  cacheToken(email, accessToken, expiresAt);
  return accessToken;
}

// one round trip per account (cache misses only), run in parallel — a suite
// that needs the whole pool shouldn't pay for it serially
export async function loadTestSessions(count?: number): Promise<TestSession[]> {
  const accounts = count === undefined ? loadTestAccounts() : testAccounts(count);

  return Promise.all(
    accounts.map(async (account) => {
      const jwt = await getJwt(account.email, account.password);
      return { ...account, jwt, userId: uidFromJwt(jwt) };
    })
  );
}
