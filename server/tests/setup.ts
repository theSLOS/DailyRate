import { config } from 'dotenv';

config(); // server/.env — SUPABASE_URL, SUPABASE_ANON_KEY
config({ path: '.env.test.local' }); // real test-account credentials, gitignored — see .env.test.example
