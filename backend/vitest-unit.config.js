// Runs explicitly classified database-independent checks without loading hosted credentials.
import { defineConfig } from 'vitest/config';
import unit_files from './vitest-unit-files.json' assert { type: 'json' };

export default defineConfig({
  test: {
    include: unit_files,
    env: { DB_PROVIDER: 'supabase', AUTH_PROVIDER: 'bcrypt', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', ALLOW_DIRECT_STORE_SIGNUP: 'true' }
  }
});
