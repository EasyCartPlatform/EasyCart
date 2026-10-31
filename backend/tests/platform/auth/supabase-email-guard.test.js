// Prevents profile edits from desynchronizing remote sign-in email while coordinated email changes are unavailable.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ user: null, update: vi.fn() }));
vi.mock('../../../src/env.js', () => ({ DB_PROVIDER: 'supabase' }));
vi.mock('../../../src/platform/db/db.js', () => ({ get_supabase: () => ({ from: () => ({
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.user }) }) }), update: state.update
}) }) }));
vi.mock('../../../src/modules/users/repositories/user-status-store.js', () => ({
  get_user_status: async () => 'active', get_user_last_active: async () => null, get_user_avatar: async () => null,
  set_user_status: vi.fn(), set_user_last_active: vi.fn(), set_user_avatar: vi.fn()
}));
import { update_user_fields } from '../../../src/modules/users/repositories/user-repository.js';
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('DB_PROVIDER', 'supabase');
  state.user = { id: 'account', email: 'old@example.com', password_hash: '$2b$12$legacy' };
});
afterEach(() => vi.unstubAllEnvs());
describe('Remote account email guard', () => {
  it('blocks email changes for migrated accounts when remote authentication is enabled', async () => {
    vi.stubEnv('AUTH_PROVIDER', 'supabase');
    await expect(update_user_fields('account', { email: 'new@example.com' })).rejects.toMatchObject({ status_code: 409 });
    expect(state.update).not.toHaveBeenCalled();
  });
  it('also protects remote accounts after the default provider changes back', async () => {
    vi.stubEnv('AUTH_PROVIDER', 'bcrypt'); state.user.password_hash = 'supabase:account';
    await expect(update_user_fields('account', { email: 'new@example.com' })).rejects.toMatchObject({ status_code: 409 });
    expect(state.update).not.toHaveBeenCalled();
  });
});
