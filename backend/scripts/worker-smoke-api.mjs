// Provides a local Supabase fixture for Worker HTTP and password-login checks.
import { createServer } from 'node:http';
export const smoke_user = {
  id: '11111111-1111-4111-8111-111111111111', email: 'worker@example.com', username: 'worker_test',
  role: 'tenant_owner', tenant_id: '22222222-2222-4222-8222-222222222222', password_hash: 'supabase:test', created_at: '2026-01-01T00:00:00Z'
};
export function create_smoke_api() {
  return createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const url = new URL(req.url, 'http://localhost');
    let body = '';
    for await (const chunk of req) body += chunk;
    if (url.pathname === '/auth/v1/token') {
      if (JSON.parse(body).password !== 'ExamplePass123!') {
        res.statusCode = 400; res.end(JSON.stringify({ error_code: 'invalid_credentials', msg: 'Invalid credentials' })); return;
      }
      res.end(JSON.stringify({ access_token: 'local-access-token', refresh_token: 'local-refresh-token', token_type: 'bearer', expires_in: 3600, user: { id: smoke_user.id, email: smoke_user.email, aud: 'authenticated' } })); return;
    }
    if (url.pathname === '/rest/v1/users') { res.end(JSON.stringify([smoke_user])); return; }
    if (url.pathname.includes('/storage/')) { res.end('{}'); return; }
    res.end('[]');
  });
}
