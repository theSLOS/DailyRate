import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15000, // integration tests hit real Supabase, not mocked — give network calls room
  },
});
