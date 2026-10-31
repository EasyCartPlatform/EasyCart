// Reads and writes user rows for whichever database is configured.
import { get_supabase } from '../../../platform/db/db.js';
import { DB_PROVIDER } from '../../../env.js';
import { chunk_array } from '../../../platform/shared/chunk-array.js';
import { User } from './user-model.js';
import { use_supabase_passwords } from '../../../platform/auth/password-provider.js';
import { AppError } from '../../../platform/shared/app-error.js';
import {
  set_user_status,
  set_user_last_active,
  get_user_status,
  get_user_last_active,
  get_user_avatar,
  set_user_avatar
} from './user-status-store.js';

const SUPABASE_IN_CHUNK_SIZE = 100;

export async function find_user_by_email(email) {
  const normalized = String(email).toLowerCase();

  if (DB_PROVIDER === 'supabase') {
    const supabase = get_supabase();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalized)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    if (!data) return null;
    const [status, last_active_at, avatar_url] = await Promise.all([
      get_user_status(data.id),
      get_user_last_active(data.id),
      get_user_avatar(data.id)
    ]);
    return { ...data, status: status || 'active', last_active_at: last_active_at || data.created_at, avatar_url: avatar_url || data.avatar_url || null };
  }

  return User.findOne({ email: normalized }).lean();
}

export async function save_user(user) {
  const normalized = {
    ...user,
    email: String(user.email).toLowerCase(),
    username: String(user.username).trim(),
    phone_number: String(user.phone_number).trim()
  };

  const now_iso = new Date().toISOString();
  const status = normalized.status || 'active';
  const last_active_at = normalized.last_active_at || now_iso;

  if (DB_PROVIDER === 'supabase') {
    const supabase = get_supabase();
    const { data, error } = await supabase
      .from('users')
      .insert([
        {
          id: normalized.id,
          username: normalized.username,
          email: normalized.email,
          phone_number: normalized.phone_number,
          password_hash: normalized.password_hash,
          role: normalized.role,
          tenant_id: normalized.tenant_id,
          created_at: now_iso
        }
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    await Promise.all([
      set_user_status(normalized.id, status),
      set_user_last_active(normalized.id, last_active_at)
    ]);

    return { ...data, status, last_active_at };
  }

  const created_user = await User.create({
    id: normalized.id,
    username: normalized.username,
    email: normalized.email,
    phone_number: normalized.phone_number,
    password_hash: normalized.password_hash,
    role: normalized.role,
    status,
    last_active_at,
    tenant_id: normalized.tenant_id,
    created_at: now_iso
  });

  return created_user.toObject();
}

export async function find_user_by_id(id) {
  if (DB_PROVIDER === 'supabase') {
    const { data, error } = await get_supabase().from('users').select('*').eq('id', id).maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return null;
    const [status, last_active_at, avatar_url] = await Promise.all([
      get_user_status(id),
      get_user_last_active(id),
      get_user_avatar(id)
    ]);
    return { ...data, status: status || 'active', last_active_at: last_active_at || data.created_at, avatar_url: avatar_url || data.avatar_url || null };
  }
  return User.findOne({ id }).lean();
}

export async function find_users_by_ids(ids) {
  if (!ids.length) return [];
  if (DB_PROVIDER === 'supabase') {
    const chunks = chunk_array(ids, SUPABASE_IN_CHUNK_SIZE);
    const results = await Promise.all(
      chunks.map(async (chunk) => {
        const { data, error } = await get_supabase().from('users').select('*').in('id', chunk);
        if (error) throw error;
        return data;
      })
    );
    return results.flat();
  }
  return User.find({ id: { $in: ids } }).lean();
}

export async function set_user_tenant_id(id, tenant_id) {
  if (DB_PROVIDER === 'supabase') {
    const { data, error } = await get_supabase().from('users').update({ tenant_id }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  return User.findOneAndUpdate({ id }, { tenant_id }, { new: true }).lean();
}

export async function update_user_role_and_tenant(id, role, tenant_id) {
  if (DB_PROVIDER === 'supabase') {
    const { data, error } = await get_supabase().from('users').update({ role, tenant_id }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  return User.findOneAndUpdate({ id }, { role, tenant_id }, { new: true }).lean();
}

export async function find_user_by_email_excluding(email, exclude_id) {
  const normalized = String(email).toLowerCase();
  if (DB_PROVIDER === 'supabase') {
    const { data, error } = await get_supabase()
      .from('users')
      .select('id, email')
      .eq('email', normalized)
      .neq('id', exclude_id)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
  return User.findOne({ email: normalized, id: { $ne: exclude_id } }).lean();
}

export async function find_user_by_username_excluding(username, exclude_id) {
  const normalized = String(username).trim();
  if (DB_PROVIDER === 'supabase') {
    const { data, error } = await get_supabase()
      .from('users')
      .select('id, username')
      .eq('username', normalized)
      .neq('id', exclude_id)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
  return User.findOne({ username: normalized, id: { $ne: exclude_id } }).lean();
}

export async function count_platform_admins() {
  if (DB_PROVIDER === 'supabase') {
    const { count, error } = await get_supabase()
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'platform_admin');
    if (error) throw error;
    return count ?? 0;
  }
  return User.countDocuments({ role: 'platform_admin' });
}

export async function update_user_fields(id, fields) {
  const { status, last_active_at, avatar_url, ...tableFields } = fields;

  if (tableFields.email !== undefined) {
    const user = await find_user_by_id(id);
    if (user && tableFields.email !== user.email && (use_supabase_passwords() || user.password_hash?.startsWith('supabase:'))) {
      throw new AppError('Please contact support to change your sign-in email.', 409);
    }
  }

  if (status !== undefined) {
    await set_user_status(id, status);
  }
  if (last_active_at !== undefined) {
    await set_user_last_active(id, last_active_at);
  }
  if (avatar_url !== undefined) {
    await set_user_avatar(id, avatar_url);
  }

  if (DB_PROVIDER === 'supabase') {
    let data;
    if (Object.keys(tableFields).length > 0) {
      const res = await get_supabase()
        .from('users')
        .update(tableFields)
        .eq('id', id)
        .select('id, username, email, phone_number, role, tenant_id, created_at')
        .single();
      if (res.error) throw res.error;
      data = res.data;
    } else {
      data = await find_user_by_id(id);
    }
    const currentStatus = status !== undefined ? status : await get_user_status(id);
    const currentActive = last_active_at !== undefined ? last_active_at : await get_user_last_active(id);
    const currentAvatar = avatar_url !== undefined ? avatar_url : await get_user_avatar(id);
    return { ...data, status: currentStatus || 'active', last_active_at: currentActive || data.created_at, avatar_url: currentAvatar || data.avatar_url || null };
  }

  const updateDoc = { ...tableFields };
  if (status !== undefined) updateDoc.status = status;
  if (last_active_at !== undefined) updateDoc.last_active_at = new Date(last_active_at);
  if (avatar_url !== undefined) updateDoc.avatar_url = avatar_url;

  return User.findOneAndUpdate(
    { id },
    { $set: updateDoc },
    { new: true }
  ).select('id username email phone_number role status last_active_at avatar_url tenant_id created_at').lean();
}

export async function update_user_last_active(id) {
  const now_iso = new Date().toISOString();
  await set_user_last_active(id, now_iso);
}
