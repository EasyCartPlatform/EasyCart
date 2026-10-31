// Creates an isolated server-only Auth client so sign-in cannot change the database client's session.
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from '../../env.js';
import { AppError } from '../shared/app-error.js';

export function create_password_auth_client() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new AppError('Authentication service is not configured', 503);
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}
