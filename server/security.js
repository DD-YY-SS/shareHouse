import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import crypto from 'node:crypto';
import { z } from 'zod';

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  // 인증 토큰별 제한입니다. 라이브 시연에서 여러 계정이 동시에
  // 채팅 목록을 갱신해도 정상 동작하도록 넉넉하게 둡니다.
  limit: 600,
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
  // 참가자 30명 기준 heartbeat/state polling을 충분히 수용하되,
  // 무제한 공개 API가 되지 않도록 별도 제한을 둡니다.
  limit: 6000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'LIVE_DEMO_RATE_LIMITED', retryAfterSeconds: 60 },
});

export const agreementLimiter = rateLimit({
  windowMs: 60_000,
  // 협약서 생성은 전용 대기열에서 다시 제어합니다. 이 제한은 중복 클릭과
  // 악성 반복 요청만 차단하고, 사용자별 정상 재시도는 허용합니다.
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const authorization = req.get('authorization');
    if (authorization) return `token:${crypto.createHash('sha256').update(authorization).digest('hex')}`;
    return `ip:${ipKeyGenerator(req.ip)}`;
  },
  message: { error: 'AGREEMENT_RATE_LIMITED', retryAfterSeconds: 60 },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 12,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  // 행사장에서는 30명이 같은 공인 IP를 공유할 수 있습니다. IP만 키로
  // 사용하면 정상 참가자 11명부터 차단되므로 계정별로 제한합니다.
  keyGenerator: (req) => {
    const accountId = String(req.body?.accountId || '').trim().toLowerCase();
    return accountId ? `login-account:${accountId}` : `login-ip:${ipKeyGenerator(req.ip)}`;
  },
  // Mock mode is local/demo-only; production keeps the account-level limiter.
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
