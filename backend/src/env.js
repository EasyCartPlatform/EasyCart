// All environment variables the app needs, read once from here.
import dotenv from 'dotenv';

dotenv.config();

export const PORT = process.env.PORT || 5000;
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';
export const DEV_JWT_SECRET = 'easycart_dev_secret_key_12345';
export const JWT_SECRET = process.env.JWT_SECRET || DEV_JWT_SECRET;

// Which database to use: "mongodb" or "supabase"
export const DB_PROVIDER = process.env.DB_PROVIDER || 'mongodb';

export const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/easycart';
export const SUPABASE_URL = process.env.SUPABASE_URL || '';
export const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// What the platform earns. Both are percentages and can be changed with PLATFORM_COMMISSION_PERCENT and RIDER_SHARE_PERCENT.
// Commission is taken from the item value of a delivered order. The rider keeps their share of the delivery fee.
function read_percent(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : fallback;
}
export const PLATFORM_COMMISSION_PERCENT = read_percent('PLATFORM_COMMISSION_PERCENT', 6);
export const RIDER_SHARE_PERCENT = read_percent('RIDER_SHARE_PERCENT', 80);

// Passcode required to create a platform admin via POST /api/admin/register. Empty disables admin sign-up.
export function get_admin_signup_passcode() {
  return process.env.ADMIN_SIGNUP_PASSCODE || '';
}

// Websites allowed to call this API from a browser, e.g. "https://shop.example.com,https://admin.example.com".
// Empty means "anyone" (fine for local development, refused in production).
export const CORS_ORIGINS = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter((origin) => origin !== '');

// Online payments. They are off unless ONLINE_PAYMENTS_ENABLED is exactly "true"; no address or machine name decides it.
//   PAYMENT_PROVIDER=mock      a test payment that takes no real money (for development)
//   PAYMENT_PROVIDER=razorpay  real payments; needs RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET
export const ONLINE_PAYMENTS_ENABLED = process.env.ONLINE_PAYMENTS_ENABLED === 'true';
export const PAYMENT_PROVIDER = process.env.PAYMENT_PROVIDER === 'razorpay' ? 'razorpay' : 'mock';
export const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
export const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';

// Translating the app (screens and product names) into Telugu or Hindi. Off unless a provider and its key are set:
//   TRANSLATE_PROVIDER=google     with GOOGLE_TRANSLATE_API_KEY  (Google Cloud Translation; detects any source language)
//   TRANSLATE_PROVIDER=anthropic  with ANTHROPIC_API_KEY
// Without it, everything simply shows in English (or the language the shop typed).
const TRANSLATE_PROVIDERS = ['google', 'anthropic'];
export const TRANSLATE_PROVIDER = TRANSLATE_PROVIDERS.includes(process.env.TRANSLATE_PROVIDER) ? process.env.TRANSLATE_PROVIDER : 'none';
export const GOOGLE_TRANSLATE_API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY || '';
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
export const TRANSLATE_MODEL = process.env.TRANSLATE_MODEL || 'claude-haiku-4-5-20251001';

// How many proxies sit in front of the server (hosting platforms use 1). Needed so rate limits see the real visitor address.
export const TRUST_PROXY_HOPS = Number(process.env.TRUST_PROXY || (IS_PRODUCTION ? 1 : 0));

// Returns a list of settings that are unsafe or missing for a production run. Empty list means good to go.
export function find_production_env_problems(env = process.env) {
  const problems = [];
  const jwt_secret = env.JWT_SECRET || '';
  const db_provider = env.DB_PROVIDER || 'mongodb';

  if (jwt_secret === '' || jwt_secret === DEV_JWT_SECRET) {
    problems.push('JWT_SECRET must be set to your own secret (not the built-in development one)');
  } else if (jwt_secret.length < 32) {
    problems.push('JWT_SECRET must be at least 32 characters long');
  }

  if (!env.CORS_ORIGIN) {
    problems.push('CORS_ORIGIN must list the website address(es) allowed to use this API');
  }

  if (db_provider === 'supabase' && (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)) {
    problems.push('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set when DB_PROVIDER=supabase');
  }
  if (db_provider === 'mongodb' && !env.MONGODB_URI) {
    problems.push('MONGODB_URI must be set when DB_PROVIDER=mongodb');
  }

  // A production server must never offer test payments that take no money.
  if (env.ONLINE_PAYMENTS_ENABLED === 'true') {
    if (env.PAYMENT_PROVIDER !== 'razorpay') {
      problems.push('ONLINE_PAYMENTS_ENABLED=true needs PAYMENT_PROVIDER=razorpay in production (the mock provider takes no real money)');
    } else if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
      problems.push('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set when PAYMENT_PROVIDER=razorpay');
    }
  }

  return problems;
}

// Stops the server from starting in production with unsafe settings.
export function assert_production_env(env = process.env) {
  const problems = find_production_env_problems(env);
  if (problems.length === 0) return;
  throw new Error(`Cannot start in production:\n - ${problems.join('\n - ')}`);
}
