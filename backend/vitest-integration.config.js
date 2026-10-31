// Runs database tests separately so pull requests can be checked without database secrets.
import { defineConfig } from 'vitest/config';
import unit_files from './vitest-unit-files.json' assert { type: 'json' };

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'], exclude: unit_files,
    testTimeout: 15000, hookTimeout: 30000,
    env: { AUTH_PROVIDER: 'bcrypt', ALLOW_DIRECT_STORE_SIGNUP: 'true' }
  }
});
