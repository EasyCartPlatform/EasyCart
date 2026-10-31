// GET /api/live opens the live-update stream. Browsers cannot send an Authorization header with EventSource,
// so the page first trades its normal token for a 60-second ticket (POST /api/live/ticket) and passes that in the URL.
// A short ticket in the URL is safe to appear in logs; the real login token never does.
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../../env.js';
import { authenticate } from '../shared/authenticate.js';
import { AppError } from '../shared/app-error.js';
import { find_rider_by_user_id } from '../../modules/delivery/repositories/rider-repository.js';
import { subscribe, channel } from './live-bus.js';

const TICKET_SECONDS = 60;
const HEARTBEAT_MS = 25_000;

export const live_router = Router();

async function channels_for(user) {
  if (user.role === 'platform_admin') return [channel.admins];
  if (user.role === 'tenant_owner') return [channel.tenant(user.tenant_id)].filter(Boolean);
  if (user.role === 'customer') return [channel.customer(user.id)];
  if (user.role === 'delivery_partner') {
    const rider = await find_rider_by_user_id(user.id);
    return rider ? [channel.rider(rider.id), channel.riders] : [];
  }
  return [];
}

live_router.post('/live/ticket', authenticate, async (req, res, next) => {
  try {
    const channels = await channels_for(req.user);
    const ticket = jwt.sign({ purpose: 'live', channels }, JWT_SECRET, { expiresIn: TICKET_SECONDS });
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
});

live_router.get('/live', (req, res, next) => {
  let channels;
  try {
    const payload = jwt.verify(String(req.query.ticket || ''), JWT_SECRET);
    if (payload.purpose !== 'live') throw new Error('wrong ticket');
    channels = payload.channels;
  } catch {
    next(new AppError('Live ticket missing or expired', 401));
    return;
  }

  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  // Tell the browser to wait 3 seconds before reconnecting after a drop.
  res.write('retry: 3000\n\n');

  const unsubscribe = subscribe(channels, res);
  // Proxies close silent connections; a comment line every 25 seconds keeps it open.
  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
    if (process.env.RUNTIME === 'cloudflare') {
      for (const topic of ['order', 'rider', 'settlement']) res.write(`data: ${JSON.stringify({ topic, id: null })}\n\n`);
    }
  }, HEARTBEAT_MS);
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});
