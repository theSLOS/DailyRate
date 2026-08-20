import { config } from 'dotenv';
import { loadTestSessions } from './helpers/accounts.js';
import { createLivePost, deletePost } from './helpers/fixtures.js';

// setupFiles run per test file; globalSetup runs in its own process and needs
// its own env load
config();
config({ path: '.env.test.local' });

const SEED_MESSAGE = 'shared test fixture — safe to delete';

// module scope survives between setup and teardown, so only posts this process
// actually created get cleaned up — an account that already had today's post is
// left alone rather than having someone else's row deleted
const created: { jwt: string; postId: string }[] = [];

// unique(user_id, local_date) means seeding an account spends its only post for
// the day. The suites' own fixtures need a free slot — an anonymous post with a
// photo in concept2, a plain one in concept3 — and they take accounts from the
// front of the pool, so the seed starts at index RESERVED_ACCOUNTS.
const RESERVED_ACCOUNTS = 1;

export async function setup(): Promise<void> {
  const sessions = (await loadTestSessions()).slice(RESERVED_ACCOUNTS);

  const results = await Promise.all(
    sessions.map(async (session) => ({
      jwt: session.jwt,
      result: await createLivePost(session.jwt, session.userId, SEED_MESSAGE),
    }))
  );

  for (const { jwt, result } of results) {
    if (result.postId !== null) created.push({ jwt, postId: result.postId });
  }

  const skipped = results.find(({ result }) => result.skipReason !== null)?.result.skipReason;
  // the only signal that a previous run crashed before teardown: a seed count
  // below the pool size means those accounts' daily slots are already spent
  // eslint-disable-next-line no-console
  console.log(
    `[globalSetup] seeded ${created.length}/${sessions.length} live posts` +
      (skipped === undefined ? '' : ` — some skipped: ${skipped}`)
  );
}

// the delete policy is entry-window scoped, so this only works while the window
// that allowed the insert is still open. A crashed run leaves the day's posts
// behind; the next run's pool walk copes, it just seeds fewer.
export async function teardown(): Promise<void> {
  await Promise.all(created.map(({ jwt, postId }) => deletePost(jwt, postId)));
}
