// Creates a platform_admin account, only when the request carries the passcode configured in the environment.
import { randomUUID } from 'node:crypto';
import { AppError } from '../../platform/shared/app-error.js';
import { get_admin_signup_passcode } from '../../env.js';
import { passcode_matches } from '../../platform/shared/passcode-matches.js';
import { save_password_account } from '../../platform/auth/account-passwords.js';
import { sign_token } from '../../platform/shared/jwt.js';
import { find_user_by_email } from '../users/repositories/user-repository.js';
import { validate_admin_signup_input } from './auth-schemas.js';

function check_admin_signup_allowed(payload) {
  const expected = get_admin_signup_passcode();
  if (!expected) throw new AppError('Admin sign-up is disabled', 403);
  const parsed = validate_admin_signup_input(payload);
  if (!parsed.success) throw new AppError(parsed.error.issues.map((issue) => issue.message).join(', '), 400);
  if (!passcode_matches(payload.passcode, expected)) throw new AppError('Invalid admin passcode', 403);
}

export async function create_platform_admin(payload) {
  check_admin_signup_allowed(payload);
  const email = String(payload.email).toLowerCase();
  if (await find_user_by_email(email)) throw new AppError('User already exists', 409);
  const user = await save_password_account({ id: randomUUID(), username: String(payload.username).trim(), email, phone_number: '0000000000', role: 'platform_admin', tenant_id: null }, payload.password);
  const token = sign_token({ sub: user.id, email: user.email, username: user.username, role: user.role, tenant_id: null });
  return { user: { id: user.id, username: user.username, email: user.email, phone_number: user.phone_number, role: user.role, avatar_url: user.avatar_url ?? null }, token };
}
