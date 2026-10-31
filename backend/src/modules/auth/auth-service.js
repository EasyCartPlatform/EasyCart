import { randomUUID } from 'node:crypto';
import { AppError } from '../../platform/shared/app-error.js';
import { validate_signup_input, validate_login_input } from './auth-schemas.js';
import { validate_slug } from '../../platform/shared/slug-validator.js';
import { save_password_account, verify_account_password } from '../../platform/auth/account-passwords.js';
import { sign_token } from '../../platform/shared/jwt.js';
import {
  find_user_by_email,
  set_user_tenant_id,
  find_user_by_id,
  update_user_fields,
  find_user_by_email_excluding,
  find_user_by_username_excluding,
  update_user_last_active
} from '../users/repositories/user-repository.js';
import { find_tenant_by_slug, save_tenant } from '../tenants/repositories/tenant-repository.js';
import { create_store_for_tenant } from '../stores/services/store-service.js';

export async function create_user(payload) {
  const parsed = validate_signup_input(payload);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues.map((issue) => issue.message).join(', '), 400);
  }

  const email = String(payload.email).toLowerCase();
  const existing_user = await find_user_by_email(email);
  if (existing_user) {
    throw new AppError('User already exists', 409);
  }

  const slug_check = validate_slug(payload.slug);
  if (!slug_check.valid) {
    throw new AppError(slug_check.message, 400);
  }
  const existing_tenant = await find_tenant_by_slug(payload.slug);
  if (existing_tenant) {
    throw new AppError('Slug already taken', 409);
  }

  const user = {
    id: randomUUID(),
    username: String(payload.username).trim(),
    email,
    phone_number: String(payload.phone_number).trim(),
    role: 'tenant_owner',
    tenant_id: null
  };
  const saved_user = await save_password_account(user, payload.password);

  const tenant = await save_tenant({ id: randomUUID(), name: payload.store_name, slug: payload.slug, owner_id: saved_user.id, status: 'active' });
  await create_store_for_tenant(tenant.id, payload.store_name, payload.slug);
  await set_user_tenant_id(saved_user.id, tenant.id);

  const token = sign_token({ sub: saved_user.id, email: saved_user.email, username: saved_user.username, role: saved_user.role, tenant_id: tenant.id });

  return {
    user: {
      id: saved_user.id,
      username: saved_user.username,
      email: saved_user.email,
      phone_number: saved_user.phone_number,
      role: saved_user.role,
      avatar_url: saved_user.avatar_url ?? null
    },
    tenant,
    token
  };
}

export async function login_user(payload) {
  const parsed = validate_login_input(payload);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues.map((issue) => issue.message).join(', '), 400);
  }

  const email = String(payload.email).toLowerCase();
  const user = await find_user_by_email(email);
  const password_matches = await verify_account_password(user, payload.password);
  if (!user || !password_matches) {
    throw new AppError('Invalid email or password', 401);
  }

  if (user.status === 'inactive') {
    throw new AppError('Your account has been deactivated. Please contact support.', 403);
  }

  await update_user_last_active(user.id);

  const token = sign_token({ sub: user.id, email: user.email, username: user.username, role: user.role, tenant_id: user.tenant_id });

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      phone_number: user.phone_number,
      role: user.role,
      avatar_url: user.avatar_url ?? null
    },
    token
  };
}

export async function get_current_profile(userId) {
  const user = await find_user_by_id(userId);
  if (!user) throw new AppError('User not found', 404);
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    phone_number: user.phone_number ?? '',
    role: user.role,
    avatar_url: user.avatar_url ?? null,
    tenant_id: user.tenant_id ?? null,
    created_at: user.created_at
  };
}

export async function update_current_profile(userId, updates) {
  const user = await find_user_by_id(userId);
  if (!user) throw new AppError('User not found', 404);

  const payload = {};
  if (updates.email !== undefined) {
    const email = String(updates.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AppError('Please provide a valid email address.', 400);
    }
    const email_taken = await find_user_by_email_excluding(email, userId);
    if (email_taken) {
      throw new AppError('Email is already registered by another user.', 409);
    }
    payload.email = email;
  }

  if (updates.username !== undefined) {
    const username = String(updates.username).trim();
    if (username.length < 3 || username.length > 30) {
      throw new AppError('Username must be between 3 and 30 characters.', 400);
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      throw new AppError('Username can only contain letters, numbers, and underscores.', 400);
    }
    const username_taken = await find_user_by_username_excluding(username, userId);
    if (username_taken) {
      throw new AppError('Username is already taken.', 409);
    }
    payload.username = username;
  }

  if (updates.phone_number !== undefined) {
    payload.phone_number = String(updates.phone_number).trim();
  }

  if (updates.avatar_url !== undefined) {
    payload.avatar_url = updates.avatar_url ? String(updates.avatar_url) : null;
  }

  const updated = await update_user_fields(userId, payload);
  if (user.role === 'delivery_partner') {
    try {
      const { find_rider_by_user_id, update_rider } = await import('../delivery/repositories/rider-repository.js');
      const rider = await find_rider_by_user_id(userId);
      if (rider) {
        const rUpdates = {};
        if (payload.email) rUpdates.email = payload.email;
        if (payload.phone_number !== undefined) rUpdates.phone_number = payload.phone_number;
        if (Object.keys(rUpdates).length > 0) {
          await update_rider(rider.id, rUpdates);
        }
      }
    } catch (_) {}
  }
  return {
    id: updated.id,
    username: updated.username,
    email: updated.email,
    phone_number: updated.phone_number ?? '',
    role: updated.role,
    avatar_url: updated.avatar_url ?? null,
    tenant_id: updated.tenant_id ?? null,
    created_at: updated.created_at
  };
}

