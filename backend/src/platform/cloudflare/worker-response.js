// Adds CORS only for configured callers when a request is rejected before Express runs.
export function worker_error(request, env, message, status) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
  const origin = request.headers.get('Origin');
  const allowed = (env.CORS_ORIGIN || '').split(',').map((item) => item.trim());
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return new Response(JSON.stringify({ error: message }), { status, headers });
}
