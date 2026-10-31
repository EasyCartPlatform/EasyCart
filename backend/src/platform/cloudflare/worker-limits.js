// Enforces per-location Cloudflare rate limits using the trusted connecting-IP header.
import { worker_error } from './worker-response.js';

export async function limit_worker_request(request, env) {
  if (request.method === 'OPTIONS') return null;
  const key = request.headers.get('CF-Connecting-IP') || 'local-development';
  const binding = request.method === 'GET' ? env.API_LIMITER : env.WRITE_LIMITER;
  if (!binding) return worker_error(request, env, 'Request protection is not configured', 503);
  const { success } = await binding.limit({ key });
  return success ? null : worker_error(request, env, 'Too many requests. Please try again later.', 429);
}
