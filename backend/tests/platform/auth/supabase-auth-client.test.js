// Ensures password login uses its own non-persistent client instead of the privileged database singleton.
import { describe, it, expect, vi } from 'vitest';
const create = vi.hoisted(() => vi.fn(() => ({ auth: {} })));
vi.mock('@supabase/supabase-js', () => ({ createClient: create }));
vi.mock('../../../src/env.js', () => ({ SUPABASE_URL: 'https://test.supabase.co', SUPABASE_KEY: 'test-only-service-key' }));
import { create_password_auth_client } from '../../../src/platform/auth/supabase-auth-client.js';
describe('Isolated Auth clients', () => {
  it('creates a fresh client for each call with browser session behavior disabled', () => {
    expect(create_password_auth_client()).not.toBe(create_password_auth_client());
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledWith('https://test.supabase.co', 'test-only-service-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  });
});
