import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import { authenticateDevelopmentAccount, createId } from './store.js';
import { getPrisma, databaseEnabled } from './prisma.js';
import { authLimiter, loginSchema, validate } from './security.js';

const accessSecret = process.env.JWT_SECRET || 'development-access-secret';
const refreshSecret = process.env.REFRESH_TOKEN_SECRET || 'development-refresh-secret';
const refreshSessions = new Map();
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', path: '/api/v1/auth' };

function accountUser(account) {
  if (!account || account.disabledAt || account.deletedAt) return null;
  const subject = account.role === 'TENANT' ? account.tenant : account.operator;
  if (!subject || subject.deletedAt) return null;
  return { id: subject.id, accountId: account.loginId, role: account.role.toLowerCase(), pseudonym: account.role === 'TENANT' ? subject.pseudonym : subject.name, operatorId: account.role === 'OPERATOR' ? subject.id : undefined, authAccountId: account.id };
}

// Stored format: scrypt$hex-salt$hex-derived-key. Passwords are never logged.
export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) { return `scrypt$${salt}$${crypto.scryptSync(password, salt, 64).toString('hex')}`; }
function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const [scheme, salt, expected] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const left = Buffer.from(crypto.scryptSync(password, salt, 64).toString('hex'), 'hex');
  const right = Buffer.from(expected, 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export async function authenticateAccount(accountId, password) {
  if (!databaseEnabled()) return authenticateDevelopmentAccount(accountId, password);
  const prisma = getPrisma();
  const account = await prisma.account.findUnique({ where: { loginId: accountId }, include: { tenant: true, operator: true } });
  if (!account || !verifyPassword(password, account.passwordHash)) return null;
  const user = accountUser(account);
  if (!user) return null;
  await prisma.account.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } });
  return user;
}

export const makeAccess = (user) => jwt.sign({ sub: user.id, accountId: user.authAccountId, role: user.role, operatorId: user.operatorId, jti: createId(), type: 'access' }, accessSecret, { issuer: 'checkmate', expiresIn: '10m' });
async function issueRefresh(user) {
  const tokenId = createId();
  const token = jwt.sign({ sub: user.id, accountId: user.authAccountId, tokenId, type: 'refresh' }, refreshSecret, { issuer: 'checkmate', expiresIn: '30d' });
  const expiresAt = new Date(Date.now() + 30 * 86400000);
  if (databaseEnabled()) await getPrisma().refreshSession.create({ data: { id: tokenId, accountId: user.authAccountId, tokenDigest: hash(token), expiresAt } });
  else refreshSessions.set(tokenId, { userId: user.id, tokenHash: hash(token), expiresAt: expiresAt.getTime() });
  return token;
}

async function consumeRefresh(raw) {
  const payload = jwt.verify(raw, refreshSecret, { issuer: 'checkmate', algorithms: ['HS256'] });
  if (payload.type !== 'refresh' || !payload.tokenId) throw new Error('refresh_invalid');
  if (!databaseEnabled()) {
    const session = refreshSessions.get(payload.tokenId);
    if (!session || session.expiresAt < Date.now() || session.tokenHash !== hash(raw)) throw new Error('refresh_reuse');
    refreshSessions.delete(payload.tokenId);
    return globalThis.__checkmateStore?.users.get(session.userId) || null;
  }
  const session = await getPrisma().refreshSession.findUnique({ where: { id: payload.tokenId }, include: { account: { include: { tenant: true, operator: true } } } });
  if (!session || session.revokedAt || session.expiresAt < new Date() || session.tokenDigest !== hash(raw)) throw new Error('refresh_reuse');
  await getPrisma().refreshSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  return accountUser(session.account);
}

export function secureAuthRouter() {
  const router = Router();
  router.post('/login', authLimiter, validate(loginSchema), async (req, res, next) => { try { const user = await authenticateAccount(req.body.accountId, req.body.password); if (!user) return res.status(401).json({ error: 'INVALID_CREDENTIALS' }); res.cookie('checkmate_refresh', await issueRefresh(user), cookieOptions); return res.json({ accessToken: makeAccess(user), expiresInSeconds: 600, user: { id: user.id, role: user.role, accountId: user.accountId, pseudonym: user.pseudonym, operatorId: user.operatorId } }); } catch (error) { return next(error); } });
  router.post('/refresh', async (req, res, next) => { const raw = req.cookies?.checkmate_refresh; if (!raw) return res.status(401).json({ error: 'REFRESH_TOKEN_REQUIRED' }); try { const user = await consumeRefresh(raw); if (!user) throw new Error('refresh_subject_missing'); res.cookie('checkmate_refresh', await issueRefresh(user), cookieOptions); return res.json({ accessToken: makeAccess(user), expiresInSeconds: 600 }); } catch (error) { res.clearCookie('checkmate_refresh', cookieOptions); return next(Object.assign(error, { statusCode: 401, code: 'REFRESH_TOKEN_INVALID' })); } });
  router.post('/logout', async (req, res, next) => { const raw = req.cookies?.checkmate_refresh; try { if (raw) { const payload = jwt.verify(raw, refreshSecret, { issuer: 'checkmate', algorithms: ['HS256'] }); if (databaseEnabled()) await getPrisma().refreshSession.updateMany({ where: { id: payload.tokenId, revokedAt: null }, data: { revokedAt: new Date() } }); else refreshSessions.delete(payload.tokenId); } res.clearCookie('checkmate_refresh', cookieOptions); return res.status(204).end(); } catch (error) { return next(error); } });
  return router;
}
