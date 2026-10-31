// Adapts the existing API to Workers with explicit startup checks and scheduled delivery cleanup.
import { httpServerHandler } from 'cloudflare:node';
import { app } from './server-main.js';
import { assert_production_env } from './env.js';
import { connect_db } from './platform/db/db.js';
import { refresh_dispatch } from './modules/delivery/services/dispatch-service.js';
import { limit_worker_request } from './platform/cloudflare/worker-limits.js';
import { worker_error } from './platform/cloudflare/worker-response.js';

app.listen(8080);
const node_handler = httpServerHandler({ port: 8080 });
let ready;
async function initialize_worker() {
  if (process.env.DB_PROVIDER !== 'supabase' || process.env.AUTH_PROVIDER !== 'supabase') throw new Error('Workers requires Supabase database and authentication');
  assert_production_env();
  await connect_db();
}

export default {
  async fetch(request, env, ctx) {
    try {
      ready ??= initialize_worker().catch((error) => { ready = null; throw error; });
      await ready;
      const limited = await limit_worker_request(request, env);
      return limited || await node_handler.fetch(request, env, ctx);
    } catch { return worker_error(request, env, 'Service is not configured or is unavailable', 503); }
  },
  async scheduled() { await initialize_worker(); await refresh_dispatch(); }
};
