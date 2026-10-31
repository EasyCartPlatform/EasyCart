// Checks passwords remotely and binds the verified Auth identity to the existing application user ID.
import { create_password_auth_client } from './supabase-auth-client.js';
import { AppError } from '../shared/app-error.js';

export async function verify_supabase_password(user, password) {
  let result;
  try {
    result = await create_password_auth_client().auth.signInWithPassword({ email: user.email, password });
  } catch {
    throw new AppError('Authentication service is unavailable. Please try again.', 503);
  }
  if (result.error) {
    if (result.error.status === 429) throw new AppError('Too many sign-in attempts. Please try again later.', 429);
    if (!result.error.status || result.error.status >= 500) throw new AppError('Authentication service is unavailable. Please try again.', 503);
    return false;
  }
  return Boolean(result.data?.user?.id && result.data.user.id === user.id);
}
