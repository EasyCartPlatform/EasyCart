// Exercises the real Workers runtime against a local fake Supabase API, without hosted credentials.
import { create_smoke_api, smoke_user } from './worker-smoke-api.mjs';
import jwt from 'jsonwebtoken';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const temp = await mkdtemp(join(tmpdir(), 'easycart-worker-'));
const mock = create_smoke_api();
await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
const variables = {
  SUPABASE_URL: `http://127.0.0.1:${mock.address().port}`, SUPABASE_SERVICE_ROLE_KEY: 'local-test-key',
  JWT_SECRET: 'local-worker-test-secret-with-at-least-32-characters', CORS_ORIGIN: 'https://test.example.com'
};
const envFile = join(temp, 'worker.env');
await writeFile(envFile, '');
const cli = ['node_modules/wrangler/bin/wrangler.js', 'dev', '--env', 'dev', '--local', '--port', '0', '--env-file', envFile];
for (const [key, value] of Object.entries(variables)) cli.push('--var', `${key}:${value}`);
const child = spawn(process.execPath, cli, { env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
child.stdout.on('data', (chunk) => { output += chunk; });
child.stderr.on('data', (chunk) => { output += chunk; });
try {
  for (let tries = 0; !output.includes('Ready on'); tries++) {
    if (tries > 150 || child.exitCode !== null) throw new Error(`Worker failed to start: ${output.slice(-2000)}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const base = output.match(/Ready on (http:\/\/[^\s\x1b]+)/)[1];
  const health = await fetch(`${base}/api/health`, { headers: { Origin: variables.CORS_ORIGIN } });
  assert.equal(health.status, 200, await health.text());
  assert.equal(health.headers.get('access-control-allow-origin'), variables.CORS_ORIGIN);
  assert.equal((await fetch(`${base}/api/orders`)).status, 401);
  assert.equal((await fetch(`${base}/api/not-a-route`)).status, 404);
  assert.equal((await fetch(`${base}/api/admin/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' })).status, 400);
  const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: smoke_user.email, password: 'ExamplePass123!' }) });
  assert.equal(login.status, 200);
  const session = await login.json();
  const claims = jwt.verify(session.token, variables.JWT_SECRET);
  assert.equal(claims.sub, smoke_user.id); assert.equal(claims.tenant_id, smoke_user.tenant_id); assert.equal(claims.role, smoke_user.role);
  console.log('Worker runtime smoke checks passed: remote password login, session claims, health, CORS, auth guards, 404, and JSON parsing.');
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve); });
  mock.closeAllConnections(); await new Promise((resolve) => mock.close(resolve));
  await rm(temp, { recursive: true, force: true });
}
