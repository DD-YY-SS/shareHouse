import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import crypto from 'node:crypto';
import { z } from 'zod';

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  // ChatInbox polls four lightweight endpoints. 120/min was too low when
  // several demo accounts were opened from the same machine/IP.
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const authorization = req.get('authorization');
    if (authorization) return `token:${crypto.createHash('sha256').update(authorization).digest('hex')}`;
    return `ip:${ipKeyGenerator(req.ip)}`;
  },
  // The live presentation has one state poll and one heartbeat per
  // participant. It uses the dedicated liveDemoLimiter below instead.
  skip: (req) => req.path.startsWith('/live-demo') || req.path === '/funnel/events',
  message: { error: 'RATE_LIMITED', retryAfterSeconds: 60 },
});

export const liveDemoLimiter = rateLimit({
  windowMs: 60_000,
  limit: 3000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'LIVE_DEMO_RATE_LIMITED', retryAfterSeconds: 60 },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  // Mock mode is local/demo-only; production keeps the 10-attempt limiter.
  skip: (req) => process.env.MOCK_MODE === 'true' || (process.env.NODE_ENV !== 'production' && /^tenant(?:[1-9]|[12]\d|30)$/.test(req.body?.accountId || '')),
  message: { error: 'AUTH_RATE_LIMITED' },
});

export const loginSchema = z.object({
  accountId: z.string().trim().min(3).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(4).max(128),
});

export const validate = (schema) => (req, res, next) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_REQUEST', fields: parsed.error.flatten().fieldErrors });
  req.body = parsed.data;
  return next();
};

export function globalErrorHandler(error, req, res, _next) {
  req.log?.error?.({ err: error, requestId: req.id }, 'request_failed');
  const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  return res.status(status).json({ error: status === 500 ? 'INTERNAL_SERVER_ERROR' : error.code || 'REQUEST_FAILED', requestId: req.id });
}
