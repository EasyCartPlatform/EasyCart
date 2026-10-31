// Checks disabled-by-default deployments and validates secret-file handling using fake credentials only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const settings = {
  DEPLOYMENT_ENABLED: 'true', SUPABASE_AUTH_MIGRATED: 'true', SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'fake-service-key', JWT_SECRET: 'fake-test-jwt-secret-with-at-least-32-characters',
  CORS_ORIGIN: 'https://test.example.com', CLOUDFLARE_ACCOUNT_ID: 'fake-account', CLOUDFLARE_API_TOKEN: 'fake-token',
  BACKEND_URL: 'https://test.workers.dev'
};
function attempt(overrides = {}) {
  const temp = mkdtempSync(join(tmpdir(), 'easycart-release-test-'));
  try {
    const result = spawnSync(process.execPath, ['scripts/ci/write-worker-secrets.mjs'], { env: { ...settings, RUNNER_TEMP: temp, ...overrides }, encoding: 'utf8' });
    if (result.status !== 0) return false;
    const path = join(temp, 'worker-secrets.json');
    assert.equal(statSync(path).mode & 0o777, 0o600);
    const secrets = JSON.parse(readFileSync(path));
    assert.equal(secrets.SUPABASE_SERVICE_ROLE_KEY, settings.SUPABASE_SERVICE_ROLE_KEY);
    assert.equal(secrets.CLOUDFLARE_API_TOKEN, undefined);
    return true;
  } finally { rmSync(temp, { recursive: true, force: true }); }
}
test('writes only Worker settings to a restricted temporary file', () => assert.equal(attempt(), true));
for (const [key, value] of [['DEPLOYMENT_ENABLED', ''], ['SUPABASE_AUTH_MIGRATED', ''], ['JWT_SECRET', 'short'], ['CLOUDFLARE_API_TOKEN', ''], ['SUPABASE_URL', ''], ['CORS_ORIGIN', '*']]) {
  test(`refuses deployment with invalid ${key}`, () => assert.equal(attempt({ [key]: value }), false));
}
