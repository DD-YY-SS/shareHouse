import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import { authenticateDevelopmentAccount, createId } from './store.js';
import { authLimiter, loginSchema, validate } from './security.js';

const accessSecret = process.env.JWT_SECRET || 'development-access-secret';
const refreshSecret = process.env.REFRESH_TOKEN_SECRET || 'development-refresh-secret';
const refreshSessions = new Map();
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/v1/auth' };
const makeAccess = (user) => jwt.sign({ sub: user.id, role: user.role, operatorId: user.operatorId, jti: createId(), type: 'access' }, accessSecret, { issuer: 'checkmate', expiresIn: '10m' });

function issueRefresh(user) {
  const tokenId = createId();
  const token = jwt.sign({ sub: user.id, tokenId, type: 'refresh' }, refreshSecret, { issuer: 'checkmate', expiresIn: '30d' });
  refreshSessions.set(tokenId, { userId: user.id, tokenHash: hash(token), expiresAt: Date.now() + 30 * 86400000 });
  return token;
}

export function secureAuthRouter() {
  const router = Router();
  router.post('/login', authLimiter, validate(loginSchema), (req, res) => {
    const user = authenticateDevelopmentAccount(req.body.accountId, req.body.password);
    if (!user) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    res.cookie('checkmate_refresh', issueRefresh(user), cookieOptions);
    return res.json({ accessToken: makeAccess(user), expiresInSeconds: 600, user: { id: user.id, role: user.role, accountId: user.accountId, pseudonym: user.pseudonym } });
  });
  router.post('/refresh', (req, res) => {
    const raw = req.cookies?.checkmate_refresh;
    if (!raw) return res.status(401).json({ error: 'REFRESH_TOKEN_REQUIRED' });
    try {
      const payload = jwt.verify(raw, refreshSecret, { issuer: 'checkmate', algorithms: ['HS256'] });
      const session = refreshSessions.get(payload.tokenId);
      if (!session || session.expiresAt < Date.now() || session.tokenHash !== hash(raw)) throw new Error('refresh_reuse');
      refreshSessions.delete(payload.tokenId);
      const user = globalThis.__checkmateStore?.users.get(session.userId);
      if (!user) return res.status(401).json({ error: 'REFRESH_SUBJECT_NOT_FOUND' });
      res.cookie('checkmate_refresh', issueRefresh(user), cookieOptions);
      return res.json({ accessToken: makeAccess(user), expiresInSeconds: 600 });
    } catch { res.clearCookie('checkmate_refresh', cookieOptions); return res.status(401).json({ error: 'REFRESH_TOKEN_INVALID' }); }
  });
  router.post('/logout', (req, res) => { const raw = req.cookies?.checkmate_refresh; if (raw) { try { const payload = jwt.verify(raw, refreshSecret, { issuer: 'checkmate' }); refreshSessions.delete(payload.tokenId); } catch {} } res.clearCookie('checkmate_refresh', cookieOptions); res.status(204).end(); });
  return router;
}
