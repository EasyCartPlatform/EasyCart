// Sets up Express and starts the server.
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { connect_db } from './platform/db/db.js';
import { PORT, IS_PRODUCTION, CORS_ORIGINS, TRUST_PROXY_HOPS, assert_production_env } from './env.js';
import { error_handler, not_found_handler } from './platform/shared/error-handler.js';
import { api_limiter } from './platform/shared/rate-limit.js';
import { auth_router } from './modules/auth/auth-route.js';
import { health_router } from './platform/health/health-route.js';
import { store_router } from './modules/stores/routes/store-route.js';
import { category_router } from './modules/categories/routes/category-route.js';
import { product_router } from './modules/products/routes/product-route.js';
import { customer_router } from './modules/customers/customer-route.js';
import { order_router } from './modules/orders/routes/order-route.js';
import { admin_router } from './modules/admin/routes/admin-route.js';
import { tenant_customer_router } from './modules/tenant-customers/routes/tenant-customer-route.js';
import { coupon_router } from './modules/coupons/routes/coupon-route.js';
import { notification_router } from './modules/notifications/routes/notification-route.js';
import { delivery_router } from './modules/delivery/routes/delivery-route.js';
import { favourite_router } from './modules/favourites/favourite-route.js';
import { rating_router } from './modules/ratings/rating-route.js';
import { earnings_router } from './modules/earnings/earnings-route.js';
import { payment_router } from './modules/payments/payment-route.js';
import { translate_router } from './modules/translate/translate-route.js';
import { photo_router } from './modules/photos/photo-route.js';
import { refund_router } from './modules/refunds/refund-route.js';
import { theme_router } from './modules/themes/theme-route.js';
import { private_file_router } from './platform/storage/private-file-route.js';
import { live_router } from './platform/live/live-route.js';
import { start_dispatch_loop } from './modules/delivery/services/dispatch-service.js';

// Browsers may only call this API from the listed websites. Calls with no origin (curl, server to server) are allowed.
// With no list set (local development), or with "*" in the list, every website is allowed.
export function is_origin_allowed(origin, allowed_origins = CORS_ORIGINS) {
  if (!origin) return true;
  if (allowed_origins.length === 0) return true;
  if (allowed_origins.includes('*')) return true;
  return allowed_origins.includes(origin);
}

export function create_express_app() {
  const app = express();
  app.set('trust proxy', TRUST_PROXY_HOPS);
  app.use(helmet());
  app.use(cors({ origin: (origin, callback) => callback(null, is_origin_allowed(origin)) }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use('/api', health_router);
  app.use('/api', private_file_router);
  app.use('/api', live_router);
  app.use('/api', api_limiter);
  app.use('/api', auth_router);
  app.use('/api', store_router);
  app.use('/api', category_router);
  app.use('/api', product_router);
  app.use('/api', customer_router);
  app.use('/api', order_router);
  app.use('/api', admin_router);
  app.use('/api', tenant_customer_router);
  app.use('/api', coupon_router);
  app.use('/api', notification_router);
  app.use('/api', delivery_router);
  app.use('/api', favourite_router);
  app.use('/api', rating_router);
  app.use('/api', earnings_router);
  app.use('/api', payment_router);
  app.use('/api', translate_router);
  app.use('/api', photo_router);
  app.use('/api', refund_router);
  app.use('/api', theme_router);
  app.use('/api', not_found_handler);
  app.use(error_handler);
  return app;
}

export const app = create_express_app();

export async function start_server_main() {
  if (IS_PRODUCTION) assert_production_env();
  await connect_db();

  // Moves any old one-rider delivery offers back to the open list that every nearby rider sees.
  start_dispatch_loop();

  const server = app.listen(PORT, () => {
    process.stdout.write(`Server running on port ${PORT}\n`);
  });

  // When the host stops or restarts the app, finish the requests in progress before exiting.
  function shut_down(signal) {
    process.stdout.write(`${signal} received, shutting down\n`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  }
  process.on('SIGTERM', () => shut_down('SIGTERM'));
  process.on('SIGINT', () => shut_down('SIGINT'));

  // A forgotten await somewhere should be logged and restarted by the host, not left running in a broken state.
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection:', reason);
    process.exit(1);
  });
}

if (process.env.NODE_ENV !== 'test' && process.env.RUNTIME !== 'cloudflare') {
  start_server_main();
}
