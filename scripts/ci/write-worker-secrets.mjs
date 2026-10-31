// Writes environment secrets to a temporary restricted file for one atomic Wrangler deployment.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'JWT_SECRET', 'CORS_ORIGIN'];
if (process.env.DEPLOYMENT_ENABLED !== 'true' || process.env.SUPABASE_AUTH_MIGRATED !== 'true') throw new Error('Enable this environment only after Supabase Auth migration and readiness checks');
for (const key of [...keys, 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'BACKEND_URL']) {
  if (!process.env[key]) throw new Error(`Missing environment setting: ${key}`);
}
if (process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must have at least 32 characters');
if (process.env.CORS_ORIGIN.split(',').some((origin) => !/^https?:\/\/[^\s*]+$/.test(origin.trim()))) throw new Error('Set explicit allowed browser origins');
writeFileSync(join(process.env.RUNNER_TEMP, 'worker-secrets.json'), JSON.stringify(Object.fromEntries(keys.map((key) => [key, process.env[key]]))), { mode: 0o600 });
