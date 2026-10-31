// Provisions password credentials with the application's UUID and sanitizes provider errors.
import { create_password_auth_client } from './supabase-auth-client.js';
import { AppError } from '../shared/app-error.js';

export async function provision_supabase_account(user, credential) {
  let result;
  try {
    result = await create_password_auth_client().auth.admin.createUser({
      id: user.id, email: user.email, ...credential, email_confirm: true,
      app_metadata: { easycart_user_id: user.id }
    });
  } catch { throw new AppError('Authentication service is unavailable. Please try again.', 503); }
  const { data, error } = result;
  if (error) {
    if (['email_exists', 'user_already_exists'].includes(error.code)) throw new AppError('User already exists', 409);
    if (error.status === 429) throw new AppError('Too many signup attempts. Please try again later.', 429);
    throw new AppError('Could not create authentication account. Please try again.', 503);
  }
  if (data?.user?.id !== user.id) throw new AppError('Authentication identity mismatch', 503);
}

export async function remove_supabase_account(id) {
  const { error } = await create_password_auth_client().auth.admin.deleteUser(id);
  if (error) throw new AppError('Authentication account cleanup failed', 503);
}
