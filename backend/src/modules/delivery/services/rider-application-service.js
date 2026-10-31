// Delivery partner sign-up and the application they fill in (profile, vehicle, documents) before an admin reviews it.
import { randomUUID } from 'node:crypto';
import { AppError } from '../../../platform/shared/app-error.js';
import { save_password_account } from '../../../platform/auth/account-passwords.js';
import { sign_token } from '../../../platform/shared/jwt.js';
import { find_user_by_email } from '../../users/repositories/user-repository.js';
import { find_rider_by_user_id, save_rider, update_rider } from '../repositories/rider-repository.js';
import { rider_signup_schema, rider_profile_schema, document_upload_schema, location_schema, MAX_OTHER_DOCUMENTS, issues_message } from '../delivery-schemas.js';
import { to_full_rider, find_missing_steps, pick_profile_fields } from '../lib/rider-views.js';
import { save_delivery_file } from './delivery-file-service.js';

// While the application is being written or after a rejection, everything can change.
// Once sent (or approved), only contact and payout details can, so the admin's checks stay valid.
const EDITABLE_STATUSES = new Set(['draft', 'rejected']);
const ALWAYS_EDITABLE = ['address_line', 'area', 'city', 'pincode', 'emergency_contact_name', 'emergency_contact_phone', 'upi_id'];

function is_duplicate_error(err) {
  return err?.code === '23505' || err?.code === 11000;
}

export async function register_rider(payload) {
  const parsed = rider_signup_schema.safeParse(payload);
  if (!parsed.success) throw new AppError(issues_message(parsed.error), 400);
  const { username, password, phone_number, full_name } = parsed.data;
  const email = parsed.data.email.toLowerCase();

  if (await find_user_by_email(email)) throw new AppError('User already exists', 409);

  let user;
  try {
    user = await save_password_account({ id: randomUUID(), username, email, phone_number, role: 'delivery_partner', tenant_id: null }, password);
  } catch (err) {
    if (is_duplicate_error(err)) throw new AppError('That username or email is already taken', 409);
    throw err;
  }
  await save_rider({ id: randomUUID(), user_id: user.id, full_name, email, phone_number, status: 'draft', documents: {}, is_online: false });

  const token = sign_token({ sub: user.id, email: user.email, username: user.username, role: user.role, tenant_id: null });
  return { user: { id: user.id, username: user.username, email: user.email, phone_number: user.phone_number, role: user.role, avatar_url: user.avatar_url ?? null }, token };
}

export async function get_rider_for_user(user_id) {
  const rider = await find_rider_by_user_id(user_id);
  if (!rider) throw new AppError('Delivery partner profile not found', 404);
  return rider;
}

export async function get_my_rider(user_id) {
  return to_full_rider(await get_rider_for_user(user_id));
}

export async function update_my_profile(user_id, payload) {
  const rider = await get_rider_for_user(user_id);
  if (rider.status === 'suspended') throw new AppError('Your account is suspended. Contact support.', 403);

  const merged = { ...pick_profile_fields(rider), ...payload };
  const parsed = rider_profile_schema.safeParse(merged);
  if (!parsed.success) throw new AppError(issues_message(parsed.error), 400);

  const updates = EDITABLE_STATUSES.has(rider.status)
    ? parsed.data
    : Object.fromEntries(ALWAYS_EDITABLE.map((field) => [field, parsed.data[field]]));
  return to_full_rider(await update_rider(rider.id, updates));
}

export async function set_my_base_location(user_id, payload) {
  const parsed = location_schema.safeParse(payload);
  if (!parsed.success) throw new AppError(issues_message(parsed.error), 400);
  const rider = await get_rider_for_user(user_id);
  return to_full_rider(await update_rider(rider.id, { ...parsed.data, location_updated_at: new Date().toISOString() }));
}

export async function upload_my_document(user_id, payload) {
  const parsed = document_upload_schema.safeParse(payload);
  if (!parsed.success) throw new AppError(issues_message(parsed.error), 400);
  const rider = await get_rider_for_user(user_id);
  // An approved rider can still add a renewed licence or insurance as an extra document, or update their photo.
  if (!EDITABLE_STATUSES.has(rider.status) && parsed.data.kind !== 'other' && parsed.data.kind !== 'partner_photo') {
    throw new AppError('Documents are locked while your application is reviewed. Add a renewed document under "Other".', 400);
  }

  const documents = { ...(rider.documents ?? {}) };
  if (parsed.data.kind === 'other' && (documents.other ?? []).length >= MAX_OTHER_DOCUMENTS) {
    throw new AppError(`You can add up to ${MAX_OTHER_DOCUMENTS} other documents`, 400);
  }

  const file_path = await save_delivery_file({ folder: `riders/${rider.id}`, kind: parsed.data.kind, file: parsed.data.file });
  if (parsed.data.kind === 'other') {
    documents.other = [...(documents.other ?? []), { path: file_path, label: parsed.data.label || 'Other document' }];
  } else {
    documents[parsed.data.kind] = file_path;
  }
  const updated = await update_rider(rider.id, { documents });
  const full = await to_full_rider(updated);
  if (parsed.data.kind === 'partner_photo' && full.photo_url) {
    try {
      const { set_user_avatar } = await import('../../users/repositories/user-status-store.js');
      await set_user_avatar(rider.user_id, full.photo_url);
    } catch (_) {}
  }
  return full;
}

export async function remove_my_other_document(user_id, index) {
  const rider = await get_rider_for_user(user_id);
  const others = [...(rider.documents?.other ?? [])];
  if (!Number.isInteger(index) || index < 0 || index >= others.length) throw new AppError('Document not found', 404);
  others.splice(index, 1);
  return to_full_rider(await update_rider(rider.id, { documents: { ...rider.documents, other: others } }));
}

export async function submit_my_application(user_id) {
  const rider = await get_rider_for_user(user_id);
  if (!EDITABLE_STATUSES.has(rider.status)) throw new AppError('Your application has already been sent', 400);
  const missing = find_missing_steps(rider);
  if (missing.length > 0) throw new AppError(`Finish these first: ${missing.join(', ').replaceAll('_', ' ')}`, 400);
  return to_full_rider(await update_rider(rider.id, { status: 'pending', submitted_at: new Date().toISOString(), review_note: null }));
}
