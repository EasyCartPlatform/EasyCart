// Rate limiters. Node limits run locally; the Cloudflare entry point enforces binding-based limits.
import rateLimit from 'express-rate-limit';

const no_op = (req, res, next) => next();
const is_test = process.env.NODE_ENV === 'test' || process.env.RUNTIME === 'cloudflare';

// Strict limit for abuse-prone endpoints (login, registration, checkout).
export const sensitive_route_limiter = is_test
  ? no_op
  : rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

// Tight limit for translating screens before sign-in, so nobody can run up the translation bill.
export const public_translate_limiter = is_test
  ? no_op
  : rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, please slow down' } });

// Generous limit for every other API call, to stop one visitor from hammering the server.
export const api_limiter = is_test
  ? no_op
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 600,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests, please slow down' }
    });
