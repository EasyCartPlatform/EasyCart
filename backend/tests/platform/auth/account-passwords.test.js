// Checks provider routing, identity binding, failure handling, and cleanup without a real database.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ save: vi.fn(), find: vi.fn(), hash: vi.fn(), compare: vi.fn(), create: vi.fn(), remove: vi.fn(), signin: vi.fn(), client: vi.fn() }));
vi.mock('../../../src/modules/users/repositories/user-repository.js', () => ({ save_user: mock.save, find_user_by_id: mock.find }));
vi.mock('../../../src/platform/shared/hash.js', () => ({ hash_password: mock.hash, check_password_matches: mock.compare }));
vi.mock('../../../src/platform/auth/supabase-auth-client.js', () => ({ create_password_auth_client: mock.client }));
import { save_password_account, verify_account_password } from '../../../src/platform/auth/account-passwords.js';
const user = { id: 'app-user-id', email: 'person@example.com', role: 'customer', tenant_id: null, password_hash: '$2b$12$legacy' };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('AUTH_PROVIDER', 'bcrypt');
  vi.stubEnv('DB_PROVIDER', 'supabase');
  mock.client.mockReturnValue({ auth: { signInWithPassword: mock.signin, admin: { createUser: mock.create, deleteUser: mock.remove } } });
  mock.save.mockImplementation(async (record) => record);
  mock.find.mockResolvedValue(null);
  mock.create.mockResolvedValue({ data: { user: { id: user.id } }, error: null });
  mock.remove.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe('Account password providers', () => {
  it('keeps existing bcrypt behavior by default', async () => {
    mock.hash.mockResolvedValue('secure-hash');
    await expect(save_password_account(user, 'password')).resolves.toMatchObject({ password_hash: 'secure-hash', id: user.id });
    expect(mock.client).not.toHaveBeenCalled();
  });
  it('checks legacy passwords locally', async () => {
    mock.compare.mockResolvedValue(true);
    expect(await verify_account_password(user, 'password')).toBe(true);
    expect(mock.compare).toHaveBeenCalledWith('password', user.password_hash);
  });
  it('rejects invalid provider configuration', async () => {
    vi.stubEnv('AUTH_PROVIDER', 'typo');
    await expect(save_password_account(user, 'password')).rejects.toMatchObject({ status_code: 503 });
    expect(mock.save).not.toHaveBeenCalled();
  });
  it('requires the Supabase database for remote provisioning', async () => {
    vi.stubEnv('AUTH_PROVIDER', 'supabase'); vi.stubEnv('DB_PROVIDER', 'mongodb');
    await expect(save_password_account(user, 'password')).rejects.toMatchObject({ status_code: 503 });
  });
  it('creates remote credentials with the existing UUID and stores no password or bcrypt hash', async () => {
    vi.stubEnv('AUTH_PROVIDER', 'supabase');
    const result = await save_password_account(user, 'private-password');
    expect(mock.create).toHaveBeenCalledWith({ id: user.id, email: user.email, password: 'private-password', email_confirm: true, app_metadata: { easycart_user_id: user.id } });
    expect(result).toMatchObject({ id: user.id, role: 'customer', tenant_id: null, password_hash: `supabase:${user.id}` });
    expect(JSON.stringify(mock.save.mock.calls)).not.toContain('private-password');
    expect(mock.hash).not.toHaveBeenCalled();
  });
  it('removes remote credentials if application persistence fails', async () => {
    vi.stubEnv('AUTH_PROVIDER', 'supabase');
    mock.save.mockRejectedValue(new Error('database failed'));
    await expect(save_password_account(user, 'password')).rejects.toThrow('database failed');
    expect(mock.remove).toHaveBeenCalledWith(user.id);
  });
  it('does not save a profile after a provisioning error or reveal provider details', async () => {
    vi.stubEnv('AUTH_PROVIDER', 'supabase');
    mock.create.mockResolvedValue({ error: { status: 500, message: 'secret provider internals' } });
    await expect(save_password_account(user, 'password')).rejects.toMatchObject({ status_code: 503 });
    expect(mock.save).not.toHaveBeenCalled();
  });
  it('preserves credentials if the profile was inserted before a later database failure', async () => {
    vi.stubEnv('AUTH_PROVIDER', 'supabase');
    mock.save.mockRejectedValue(new Error('status update failed'));
    mock.find.mockResolvedValue(user);
    await expect(save_password_account(user, 'password')).rejects.toThrow('status update failed');
    expect(mock.remove).not.toHaveBeenCalled();
  });
  it('rejects identity mismatch during provisioning', async () => {
    vi.stubEnv('AUTH_PROVIDER', 'supabase');
    mock.create.mockResolvedValue({ data: { user: { id: 'other-id' } } });
    await expect(save_password_account(user, 'password')).rejects.toMatchObject({ status_code: 503 });
    expect(mock.save).not.toHaveBeenCalled();
  });
  it('accepts only a matching verified Auth UUID', async () => {
    vi.stubEnv('AUTH_PROVIDER', 'supabase');
    mock.signin.mockResolvedValue({ data: { user: { id: user.id, role: 'service_role' } } });
    expect(await verify_account_password(user, 'password')).toBe(true);
    expect(mock.compare).not.toHaveBeenCalled();
    expect(user.role).toBe('customer');
  });
  it('rejects another Auth identity even if email matches', async () => {
    vi.stubEnv('AUTH_PROVIDER', 'supabase');
    mock.signin.mockResolvedValue({ data: { user: { id: 'different-id', email: user.email } } });
    expect(await verify_account_password(user, 'password')).toBe(false);
  });
  it('never falls back to bcrypt on a remote credential rejection', async () => {
    vi.stubEnv('AUTH_PROVIDER', 'supabase');
    mock.signin.mockResolvedValue({ error: { status: 400, code: 'invalid_credentials' } });
    expect(await verify_account_password(user, 'wrong')).toBe(false);
    expect(mock.compare).not.toHaveBeenCalled();
  });
  it('continues verifying remote accounts remotely after changing the default provider', async () => {
    mock.signin.mockResolvedValue({ data: { user: { id: user.id } } });
    expect(await verify_account_password({ ...user, password_hash: `supabase:${user.id}` }, 'password')).toBe(true);
    expect(mock.compare).not.toHaveBeenCalled();
  });
  it('rejects unknown users without calling Auth', async () => {
    vi.stubEnv('AUTH_PROVIDER', 'supabase');
    expect(await verify_account_password(null, 'password')).toBe(false);
    expect(mock.client).not.toHaveBeenCalled();
  });
  it.each([429, 500])('reports provider status %i without treating it as a bad password', async (status) => {
    vi.stubEnv('AUTH_PROVIDER', 'supabase');
    mock.signin.mockResolvedValue({ error: { status, message: 'private detail' } });
    await expect(verify_account_password(user, 'password')).rejects.toMatchObject({ status_code: status === 429 ? 429 : 503 });
  });
  it('sanitizes network failures', async () => {
    vi.stubEnv('AUTH_PROVIDER', 'supabase'); mock.signin.mockRejectedValue(new Error('private URL'));
    await expect(verify_account_password(user, 'password')).rejects.toMatchObject({ status_code: 503, message: 'Authentication service is unavailable. Please try again.' });
  });
});
