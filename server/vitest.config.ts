import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    globalSetup: ['./tests/globalSetup.ts'], // seeds one live post per test account, deletes them after
    // these suites all read and write one shared Supabase project, so running
    // files concurrently lets one suite's fixture insert/delete land between
    // another's two requests — sequential is correct here, not just safer
    fileParallelism: false,
    testTimeout: 15000, // integration tests hit real Supabase, not mocked — give network calls room
  },
});
