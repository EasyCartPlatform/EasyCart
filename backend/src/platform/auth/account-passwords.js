// Routes account creation and password checks while preserving application sessions and permissions.
import { hash_password, check_password_matches } from '../shared/hash.js';
import { save_user, find_user_by_id } from '../../modules/users/repositories/user-repository.js';
import { use_supabase_passwords } from './password-provider.js';
import { provision_supabase_account, remove_supabase_account } from './supabase-account.js';
import { verify_supabase_password } from './supabase-passwords.js';

export async function save_password_account(user, password) {
  if (!use_supabase_passwords()) return save_user({ ...user, password_hash: await hash_password(password) });
  await provision_supabase_account(user, { password });
  try {
    return await save_user({ ...user, password_hash: `supabase:${user.id}` });
  } catch (error) {
    try {
      if (!await find_user_by_id(user.id)) await remove_supabase_account(user.id);
    } catch { console.error('Authentication account cleanup requires administrator review'); }
    throw error;
  }
}

export async function verify_account_password(user, password) {
  const remote = use_supabase_passwords();
  if (!user) return false;
  if (remote || user.password_hash?.startsWith('supabase:')) return verify_supabase_password(user, password);
  return check_password_matches(password, user.password_hash);
}
