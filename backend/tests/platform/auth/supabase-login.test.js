// Verifies remote password checks preserve application roles, tenant claims, and inactive-account restrictions.
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const mocked = vi.hoisted(() => ({ find: vi.fn(), touch: vi.fn(), signin: vi.fn() }));
vi.mock('../../../src/modules/users/repositories/user-repository.js', () => ({
  find_user_by_email: mocked.find, update_user_last_active: mocked.touch, save_user: vi.fn(),
  set_user_tenant_id: vi.fn(), find_user_by_id: vi.fn(), update_user_fields: vi.fn(),
  find_user_by_email_excluding: vi.fn(), find_user_by_username_excluding: vi.fn()
}));
vi.mock('../../../src/platform/auth/supabase-auth-client.js', () => ({
  create_password_auth_client: () => ({ auth: { signInWithPassword: mocked.signin } })
}));
import { login_user } from '../../../src/modules/auth/auth-service.js';
import { login_customer } from '../../../src/modules/customers/customer-service.js';
import { verify_token } from '../../../src/platform/shared/jwt.js';
const account = { id: 'existing-user', email: 'friend@example.com', username: 'friend', role: 'tenant_owner', tenant_id: 'own-tenant', status: 'active' };
const payload = { email: account.email, password: 'ExamplePass123!' };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('AUTH_PROVIDER', 'supabase'); vi.stubEnv('DB_PROVIDER', 'supabase');
  mocked.find.mockResolvedValue(account);
  mocked.signin.mockResolvedValue({ data: { user: { id: account.id, role: 'service_role', user_metadata: { tenant_id: 'other-tenant' } } } });
});
afterEach(() => vi.unstubAllEnvs());
describe('Application login with Supabase passwords', () => {
  it('keeps application user IDs and tenant claims, ignoring Auth role metadata', async () => {
    const result = await login_user(payload);
    expect(verify_token(result.token)).toMatchObject({ sub: account.id, role: 'tenant_owner', tenant_id: 'own-tenant' });
    expect(result.user).not.toHaveProperty('password_hash');
    expect(result).not.toHaveProperty('refresh_token');
  });
  it('rejects an inactive account after valid remote credentials', async () => {
    mocked.find.mockResolvedValue({ ...account, status: 'inactive' });
    await expect(login_user(payload)).rejects.toMatchObject({ status_code: 403 });
    expect(mocked.touch).not.toHaveBeenCalled();
  });
  it('rejects an unknown account with the usual generic error', async () => {
    mocked.find.mockResolvedValue(null);
    await expect(login_user(payload)).rejects.toMatchObject({ status_code: 401, message: 'Invalid email or password' });
    expect(mocked.signin).not.toHaveBeenCalled();
  });
  it('rejects a mismatched Auth UUID', async () => {
    mocked.signin.mockResolvedValue({ data: { user: { id: 'unrelated-account' } } });
    await expect(login_user(payload)).rejects.toMatchObject({ status_code: 401, message: 'Invalid email or password' });
    expect(mocked.touch).not.toHaveBeenCalled();
  });
  it('rejects an owner at the customer login endpoint', async () => {
    await expect(login_customer(payload)).rejects.toMatchObject({ status_code: 401 });
  });
  it('issues a customer session without a tenant claim', async () => {
    mocked.find.mockResolvedValue({ ...account, role: 'customer', tenant_id: null });
    const result = await login_customer(payload);
    expect(verify_token(result.token)).toMatchObject({ sub: account.id, role: 'customer', tenant_id: null });
  });
  it('rejects inactive customers too', async () => {
    mocked.find.mockResolvedValue({ ...account, role: 'customer', status: 'inactive' });
    await expect(login_customer(payload)).rejects.toMatchObject({ status_code: 403 });
  });
});
