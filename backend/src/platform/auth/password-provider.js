// Selects the password provider explicitly and rejects unsafe configuration.
import { AppError } from '../shared/app-error.js';

export function use_supabase_passwords() {
  const provider = process.env.AUTH_PROVIDER || 'bcrypt';
  if (!['bcrypt', 'supabase'].includes(provider)) throw new AppError('Invalid authentication configuration', 503);
  if (provider === 'supabase' && process.env.DB_PROVIDER !== 'supabase') {
    throw new AppError('Supabase authentication requires the Supabase database provider', 503);
  }
  return provider === 'supabase';
}
