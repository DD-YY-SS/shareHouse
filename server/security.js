import rateLimit from 'express-rate-limit';
import { z } from 'zod';

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', retryAfterSeconds: 60 },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  // Mock mode is local/demo-only; production keeps the 10-attempt limiter.
  skip: (req) => process.env.MOCK_MODE === 'true' || (process.env.NODE_ENV !== 'production' && ['tenant1', 'tenant2'].includes(req.body?.accountId)),
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
