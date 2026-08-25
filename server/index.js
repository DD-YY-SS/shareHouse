import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: true });
dotenv.config();
import crypto from 'node:crypto';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import cron from 'node-cron';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rankCandidates, scoreCompatibility } from './matching.js';
import { createId, store } from './store.js';
import { apiLimiter, authLimiter, globalErrorHandler } from './security.js';
import { httpLogger, requestId } from './observability.js';
import { authenticateAccount, secureAuthRouter } from './auth.js';
import { assertProductionConfiguration } from './production.js';
import { maskContactInfo } from './services/contact-guard.js';
import { recordOutcomeLabel as saveOutcomeLabel } from './services/feedback-labeling.js';
import { startCheckinScheduler } from './jobs/checkin-scheduler.js';
import { databaseEnabled, getPrisma } from './prisma.js';
import { ConditionLogRepository } from './repositories/condition-log.repository.js';
import { CheckinRepository } from './repositories/checkin.repository.js';
import { draftAgreementFromMessages, fallbackDraft } from './services/agreement-drafter.js';

assertProductionConfiguration();
const app = express(); const server = http.createServer(app); const PORT = Number(process.env.PORT || 4000); const JWT_SECRET = process.env.JWT_SECRET || 'development-only-change-before-production'; const PEPPER = process.env.VERIFICATION_PEPPER || 'development-only-pepper';
// Render terminates the public connection at a single trusted reverse proxy.
// Trusting that one hop lets express-rate-limit use the real client IP from
// X-Forwarded-For without treating the proxy header as an attack.
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);
const allowedOrigins = new Set((process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((origin) => origin.trim().replace(/\/$/, '')).filter(Boolean));
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin.replace(/\/$/, ''))) return callback(null, true);
    return callback(new Error('CORS_ORIGIN_NOT_ALLOWED'));
  },
  credentials: true,
};
globalThis.__checkmateStore = store;
const io = new Server(server, { cors: { origin: [...allowedOrigins], credentials: true } });
let redisClient = null;
if (process.env.REDIS_URL) {
  let publisher;
  let subscriber;
  try {
    publisher = createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 1000, reconnectStrategy: false } });
    subscriber = publisher.duplicate();
    // Prevent a transient Redis outage from terminating the web API process.
    publisher.on('error', () => undefined);
    subscriber.on('error', () => undefined);
    await Promise.all([publisher.connect(), subscriber.connect()]);
    io.adapter(createAdapter(publisher, subscriber));
    redisClient = publisher;
    console.log('Redis adapter and TTL message store enabled');
  } catch {
    // A failed connect can leave a Redis client in the closed state. Calling
    // destroy() on that state throws ClientClosedError and prevents the API
    // from falling back to the in-memory chat store.
    for (const client of [publisher, subscriber]) {
      try {
        if (client?.isOpen) client.destroy();
      } catch {
        // Redis is optional in local Mock mode; cleanup errors are non-fatal.
      }
    }
    console.warn('Redis is unavailable; using in-memory chat fallback. Start Redis to enable shared real-time delivery.');
  }
}
app.use(helmet()); app.use(requestId); app.use(httpLogger); app.use(cors(corsOptions)); app.use(cookieParser()); app.use(express.json({ limit: '32kb' }));
// Authenticated API responses contain user-specific state. Never let a 304
// response make the client treat an empty body as an empty chat list.
app.use('/api/v1', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/api/v1', apiLimiter); app.use('/api/v1/auth/secure', secureAuthRouter());
const digest = (value) => crypto.createHmac('sha256', PEPPER).update(value).digest('hex');
const tokenFor = (user) => jwt.sign({ sub: user.id, role: user.role, operatorId: user.operatorId, jti: createId() }, JWT_SECRET, { issuer: 'checkmate', expiresIn: '30m' });
function requireToken(req, res, next) { const token = req.headers.authorization?.replace('Bearer ', ''); if (!token) return res.status(401).json({ error: 'UNAUTHORIZED' }); try { req.auth = jwt.verify(token, JWT_SECRET, { issuer: 'checkmate' }); return next(); } catch { return res.status(401).json({ error: 'TOKEN_INVALID_OR_EXPIRED' }); } }
function requireOperator(req, res, next) { if (req.auth.role !== 'operator') return res.status(403).json({ error: 'OPERATOR_ROLE_REQUIRED' }); return next(); }
function requireDatabase(req, res, next) { if (!getPrisma()) return res.status(503).json({ error: 'PERSISTENCE_REQUIRED' }); return next(); }

// The selected product version is deliberately carried in the profile JSONB
// and repeated in a request header. The header makes the active mode explicit
// while the JSONB metadata lets candidate filtering work across sessions.
const supportedVariants = new Set(['standard', 'dorm', 'nearby']);
const requestVariant = (req) => {
  const raw = req.get('x-checkmate-variant') || req.query?.variant || req.body?.variant;
  return supportedVariants.has(raw) ? raw : 'standard';
};
const profileMeta = (answers) => answers && typeof answers === 'object' && answers._meta && typeof answers._meta === 'object' ? answers._meta : {};
const finiteCoordinate = (value) => typeof value === 'number' && Number.isFinite(value);
const distanceKm = (left, right) => {
  const toRadians = (value) => value * Math.PI / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(right.latitude - left.latitude);
  const dLon = toRadians(right.longitude - left.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(left.latitude)) * Math.cos(toRadians(right.latitude)) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
const matchesVariant = (ownAnswers, candidateAnswers, variant) => {
  const own = profileMeta(ownAnswers);
  const candidate = profileMeta(candidateAnswers);
  if (variant === 'standard') return !candidate.variant || candidate.variant === 'standard';
  if (variant === 'dorm') return own.variant === 'dorm' && candidate.variant === 'dorm' && Boolean(own.campusId) && own.campusId === candidate.campusId;
  if (variant === 'nearby') {
    if (own.variant !== 'nearby' || candidate.variant !== 'nearby') return false;
    if (![own, candidate].every((item) => finiteCoordinate(item.latitude) && finiteCoordinate(item.longitude))) return false;
    const radiusKm = Number(process.env.NEARBY_MATCH_RADIUS_KM || 1);
    return distanceKm(own, candidate) <= (Number.isFinite(radiusKm) && radiusKm > 0 ? radiusKm : 1);
  }
  return false;
};
const normalizeProfileMeta = (value, variant) => {
  const source = value && typeof value === 'object' ? value : {};
  const meta = { variant };
  if (variant === 'dorm') meta.campusId = String(source.campusId || 'demo-campus').trim().slice(0, 80);
  if (variant === 'nearby') {
    meta.latitude = Number.isFinite(Number(source.latitude)) ? Number(source.latitude) : null;
    meta.longitude = Number.isFinite(Number(source.longitude)) ? Number(source.longitude) : null;
  }
  return meta;
};
// A candidate must always be a different tenant. This guard protects both the
// PostgreSQL flow and the Mock flow from stale UI state or a forged request.
app.use('/api/v1/matches', requireToken, (req, res, next) => {
  if (req.method === 'POST' && req.body?.candidateId && req.body.candidateId === req.auth.sub) return res.status(400).json({ error: 'SELF_MATCH_NOT_ALLOWED' });
  return next();
});

// Typed chat-session compatibility layer. PRE_MOVE remains the default for the
// existing inbox, while ROOMMATE is created after both payments are captured.
const chatSessionType = (value) => value === 'ROOMMATE' ? 'ROOMMATE' : 'PRE_MOVE';
const chatRoomName = (type, matchId) => `chat:${type === 'ROOMMATE' ? 'roommate' : 'pre-move'}:${matchId}`;
const chatMessageKey = (type, matchId) => `${chatRoomName(type, matchId)}:messages`;
const chatMetaKey = (type, matchId) => `${chatRoomName(type, matchId)}:meta`;

// Database match creation is intentionally placed before the legacy mock route.
// A request is not a chat permission: only ACCEPTED/CONFIRMED matches may open chat.
app.post('/api/v1/matches', requireToken, async (req, res, next) => {
  if (!databaseEnabled()) return next('route');
  try {
    const prisma = getPrisma();
    const candidateId = req.body?.candidateId;
    const candidate = await prisma.tenant.findUnique({ where: { id: candidateId }, include: { behaviorProfile: true } });
    const own = await prisma.behaviorProfile.findUnique({ where: { tenantId: req.auth.sub } });
    if (!candidate?.behaviorProfile || !own?.completedAt) return res.status(400).json({ error: 'PROFILE_REQUIRED' });
    if (!matchesVariant(own.answers, candidate.behaviorProfile.answers, requestVariant(req))) return res.status(409).json({ error: 'VARIANT_MATCH_REQUIRED' });

    const existingPair = await prisma.match.findFirst({
      where: {
        OR: [{ tenantAId: req.auth.sub, tenantBId: candidateId }, { tenantAId: candidateId, tenantBId: req.auth.sub }],
        status: { in: ['REQUESTED', 'ACCEPTED', 'CONFIRMED'] },
        deletedAt: null,
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (existingPair) {
      if (existingPair.tenantAId === candidateId && existingPair.tenantBId === req.auth.sub && existingPair.status === 'REQUESTED') {
        const accepted = await prisma.match.update({ where: { id: existingPair.id }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
        return res.json({ match: { id: accepted.id, memberIds: [accepted.tenantAId, accepted.tenantBId], status: 'accepted', compatibility: accepted.compatibilityScore, breakdown: accepted.scoreBreakdown }, reused: true, mutual: true });
      }
      return res.json({ match: { id: existingPair.id, memberIds: [existingPair.tenantAId, existingPair.tenantBId], status: existingPair.status.toLowerCase(), compatibility: existingPair.compatibilityScore, breakdown: existingPair.scoreBreakdown }, reused: true, mutual: existingPair.status !== 'REQUESTED' });
    }

    const existingForUser = await prisma.match.findFirst({
      where: { OR: [{ tenantAId: req.auth.sub }, { tenantBId: req.auth.sub }], status: { in: ['REQUESTED', 'ACCEPTED', 'CONFIRMED'] }, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    if (existingForUser) return res.status(409).json({ error: 'MATCH_ALREADY_IN_PROGRESS', match: { id: existingForUser.id, memberIds: [existingForUser.tenantAId, existingForUser.tenantBId], status: existingForUser.status.toLowerCase() } });

    const room = await prisma.room.findFirst({ where: { status: 'VACANT', deletedAt: null } });
    if (!room) return res.status(409).json({ error: 'NO_AVAILABLE_ROOM' });
    const result = scoreCompatibility(own.answers, candidate.behaviorProfile.answers, store.rules);
    const match = await prisma.match.create({ data: { tenantAId: req.auth.sub, tenantBId: candidateId, roomId: room.id, compatibilityScore: result.score, scoreBreakdown: result.breakdown, status: 'REQUESTED' } });
    return res.status(201).json({ match: { id: match.id, memberIds: [match.tenantAId, match.tenantBId], status: 'requested', compatibility: match.compatibilityScore, breakdown: match.scoreBreakdown }, mutual: false });
  } catch (error) { return next(error); }
});

app.get('/api/v1/matches/candidates', requireToken, async (req, res, next) => {
  if (!databaseEnabled()) return next('route');
  try {
    const prisma = getPrisma();
    const own = await prisma.behaviorProfile.findUnique({ where: { tenantId: req.auth.sub } });
    if (!own?.completedAt) return res.status(404).json({ error: 'PROFILE_NOT_FOUND' });
    const variant = requestVariant(req);
    const profiles = await prisma.behaviorProfile.findMany({ where: { tenantId: { not: req.auth.sub }, completedAt: { not: null }, deletedAt: null }, include: { tenant: { select: { id: true, pseudonym: true, age: true, gender: true } } } });
    const candidates = profiles.filter((item) => matchesVariant(own.answers, item.answers, variant)).map((item) => { const result = scoreCompatibility(own.answers, item.answers, store.rules); return { candidateId: item.tenantId, pseudonym: 'Anonymous tenant', compatibility: result.score, score: result.score, breakdown: result.breakdown, bestReasons: result.bestReasons, watchouts: result.watchouts, variant }; });
    const activeRow = await prisma.match.findFirst({ where: { OR: [{ tenantAId: req.auth.sub }, { tenantBId: req.auth.sub }], status: { in: ['ACCEPTED', 'CONFIRMED'] }, deletedAt: null }, select: { id: true, tenantAId: true, tenantBId: true, status: true, compatibilityScore: true, scoreBreakdown: true } });
    const pendingRow = await prisma.match.findFirst({ where: { OR: [{ tenantAId: req.auth.sub }, { tenantBId: req.auth.sub }], status: 'REQUESTED', deletedAt: null }, orderBy: { updatedAt: 'desc' }, select: { id: true, tenantAId: true, tenantBId: true, status: true, compatibilityScore: true, scoreBreakdown: true } });
    const toMatchState = (row) => row ? { id: row.id, memberIds: [row.tenantAId, row.tenantBId], status: row.status.toLowerCase(), compatibility: row.compatibilityScore, score: row.compatibilityScore, breakdown: row.scoreBreakdown } : null;
    const activeMatch = toMatchState(activeRow);
    const pendingMatch = toMatchState(pendingRow);
    const selected = activeMatch || pendingMatch;
    const selectedCandidate = selected ? candidates.find((candidate) => selected.memberIds.includes(candidate.candidateId)) : null;
    return res.json({ rules: store.rules, preferences: {}, totalCandidates: candidates.length, recommended: selectedCandidate ? { ...selectedCandidate, matchId: selected.id, status: selected.status, accepted: ['accepted', 'confirmed'].includes(selected.status) } : candidates[0] || null, activeMatch, pendingMatch, candidates });
  } catch (error) { return next(error); }
});

app.get('/api/v1/chat/rooms', requireToken, async (req, res, next) => {
  if (!databaseEnabled()) return next('route');
  try {
    const type = chatSessionType(req.query.type);
    const rows = await getPrisma().match.findMany({ where: { OR: [{ tenantAId: req.auth.sub }, { tenantBId: req.auth.sub }], status: type === 'ROOMMATE' ? 'CONFIRMED' : { in: ['ACCEPTED', 'CONFIRMED'] }, deletedAt: null }, include: { tenantA: { select: { id: true, pseudonym: true } }, tenantB: { select: { id: true, pseudonym: true } }, chatSessions: { where: { type, deletedAt: null }, orderBy: { updatedAt: 'desc' }, take: 1 } }, orderBy: { updatedAt: 'desc' } });
    return res.json({ rooms: rows.map((row) => ({ matchId: row.id, compatibility: row.compatibilityScore, score: row.compatibilityScore, partner: row.tenantAId === req.auth.sub ? row.tenantB : row.tenantA, chat: row.chatSessions[0] || null, type })) });
  } catch (error) { return next(error); }
});

app.post('/api/v1/matches/:id/chat-sessions', requireToken, async (req, res, next) => {
  if (!databaseEnabled()) return next('route');
  try {
    const prisma = getPrisma();
    const type = chatSessionType(req.body?.type);
    const match = await prisma.match.findFirst({ where: { id: req.params.id, OR: [{ tenantAId: req.auth.sub }, { tenantBId: req.auth.sub }], deletedAt: null } });
    if (!match) return res.status(404).json({ error: 'MATCH_NOT_FOUND' });
    if (!['ACCEPTED', 'CONFIRMED'].includes(match.status)) return res.status(409).json({ error: 'MATCH_NOT_ACCEPTED' });
    if (type === 'ROOMMATE' && match.status !== 'CONFIRMED') return res.status(409).json({ error: 'MOVE_IN_NOT_CONFIRMED' });
    const existing = await prisma.chatSession.findUnique({ where: { matchId_type: { matchId: match.id, type } } });
    const active = existing && existing.status === 'ACTIVE' && (type === 'ROOMMATE' || (existing.expiresAt && existing.expiresAt > new Date()));
    if (active) return res.json({ chat: { id: existing.id, matchId: existing.matchId, type: existing.type, expiresAt: existing.expiresAt, reused: true } });
    const chat = await prisma.chatSession.upsert({ where: { matchId_type: { matchId: match.id, type } }, update: { status: 'ACTIVE', expiresAt: type === 'ROOMMATE' ? null : new Date(Date.now() + 1800000), deletedAt: null }, create: { matchId: match.id, type, status: 'ACTIVE', expiresAt: type === 'ROOMMATE' ? null : new Date(Date.now() + 1800000) } });
    return res.status(201).json({ chat: { id: chat.id, matchId: chat.matchId, type: chat.type, expiresAt: chat.expiresAt } });
  } catch (error) { return next(error); }
});

// Restore the payment state when the user re-enters the confirmation screen.
// The payment belongs to the match, so the client must not rely only on
// component state or a payment id kept in the previous chat session.
app.get('/api/v1/matches/:id/payment-status', requireToken, async (req, res, next) => {
  try {
    if (databaseEnabled()) {
      const prisma = getPrisma();
      const match = await prisma.match.findFirst({
        where: {
          id: req.params.id,
          deletedAt: null,
          OR: [{ tenantAId: req.auth.sub }, { tenantBId: req.auth.sub }],
        },
        include: { payment: true },
      });
      if (!match) return res.status(404).json({ error: 'MATCH_NOT_FOUND' });

      const payment = match.payment;
      const paidTenantIds = payment?.paidTenantIds || [];
      const currentUserPaid = paidTenantIds.includes(req.auth.sub);
      const allTenantsPaid = [match.tenantAId, match.tenantBId]
        .every((tenantId) => paidTenantIds.includes(tenantId));

      return res.json({
        payment: payment ? {
          id: payment.id,
          amountKrw: payment.amountKrw,
          status: payment.status,
          paidAt: payment.paidAt,
        } : null,
        currentUserPaid,
        allTenantsPaid,
        matchStatus: match.status,
      });
    }

    const match = store.matches.get(req.params.id);
    if (!match || !match.memberIds.includes(req.auth.sub)) {
      return res.status(404).json({ error: 'MATCH_NOT_FOUND' });
    }
    const payments = [...store.payments.values()].filter((payment) => payment.matchId === match.id);
    const currentUserPaid = payments.some((payment) => payment.userId === req.auth.sub && payment.status === 'paid');
    const allTenantsPaid = match.memberIds.every((tenantId) => payments.some((payment) => payment.userId === tenantId && payment.status === 'paid'));
    const latestPayment = payments.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
    return res.json({
      payment: latestPayment ? {
        id: latestPayment.id,
        amountKrw: latestPayment.amountKrw,
        status: latestPayment.status,
        paidAt: latestPayment.capturedAt || null,
      } : null,
      currentUserPaid,
      allTenantsPaid,
      matchStatus: match.status,
    });
  } catch (error) {
    return next(error);
  }
});

// Persist roommate presence per match and tenant. The in-memory implementation
// below is kept for mock mode, while database mode must be shared by both
// logged-in accounts so one tenant can see the other tenant's status.
const databasePresenceStatus = (value) => {
  const normalized = String(value || '').toLowerCase();
  if (['available', 'online'].includes(normalized)) return 'ONLINE';
  if (normalized === 'away') return 'AWAY';
  if (normalized === 'sleeping') return 'SLEEPING';
  if (['focus', 'do_not_disturb', 'donotdisturb'].includes(normalized)) return 'DO_NOT_DISTURB';
  return null;
};

app.get('/api/v1/matches/:id/presence', requireToken, async (req, res, next) => {
  if (!databaseEnabled()) return next('route');
  try {
    const prisma = getPrisma();
    const match = await prisma.match.findFirst({ where: { id: req.params.id, deletedAt: null, status: { in: ['ACCEPTED', 'CONFIRMED'] }, OR: [{ tenantAId: req.auth.sub }, { tenantBId: req.auth.sub }] } });
    if (!match) return res.status(404).json({ error: 'MATCH_NOT_FOUND' });
    const rows = await prisma.roommatePresence.findMany({ where: { matchId: match.id, deletedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
    return res.json({ statuses: rows.map((row) => ({ status: row.status.toLowerCase(), expiresAt: row.expiresAt, isSelf: row.tenantId === req.auth.sub })) });
  } catch (error) { return next(error); }
});

app.put('/api/v1/matches/:id/presence/me', requireToken, async (req, res, next) => {
  if (!databaseEnabled()) return next('route');
  try {
    const prisma = getPrisma();
    const match = await prisma.match.findFirst({ where: { id: req.params.id, deletedAt: null, status: { in: ['ACCEPTED', 'CONFIRMED'] }, OR: [{ tenantAId: req.auth.sub }, { tenantBId: req.auth.sub }] } });
    if (!match) return res.status(404).json({ error: 'MATCH_NOT_FOUND' });
    const status = databasePresenceStatus(req.body?.status);
    if (!status) return res.status(400).json({ error: 'INVALID_PRESENCE_STATUS' });
    const row = await prisma.roommatePresence.upsert({ where: { matchId_tenantId: { matchId: match.id, tenantId: req.auth.sub } }, update: { status, expiresAt: status === 'ONLINE' ? null : new Date(Date.now() + 8 * 60 * 60 * 1000), deletedAt: null }, create: { matchId: match.id, tenantId: req.auth.sub, status, expiresAt: status === 'ONLINE' ? null : new Date(Date.now() + 8 * 60 * 60 * 1000) } });
    return res.json({ status: row.status.toLowerCase(), expiresAt: row.expiresAt });
  } catch (error) { return next(error); }
});

// Capture is re-read inside the transaction so two tenants paying at nearly
// the same time cannot overwrite each other's paidTenantIds.
app.post('/api/v1/payments/:id/capture', requireToken, async (req, res, next) => {
  if (!databaseEnabled()) return next('route');
  try {
    const prisma = getPrisma();
    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: req.params.id }, include: { match: true } });
      if (!payment?.match || ![payment.match.tenantAId, payment.match.tenantBId].includes(req.auth.sub)) throw Object.assign(new Error('PAYMENT_NOT_FOUND'), { statusCode: 404, code: 'PAYMENT_NOT_FOUND' });
      if (!['ACCEPTED', 'CONFIRMED'].includes(payment.match.status)) throw Object.assign(new Error('MATCH_NOT_ACCEPTED'), { statusCode: 409, code: 'MATCH_NOT_ACCEPTED' });
      const paidTenantIds = [...new Set([...(payment.paidTenantIds || []), req.auth.sub])];
      const complete = payment.match.tenantAId && payment.match.tenantBId && paidTenantIds.includes(payment.match.tenantAId) && paidTenantIds.includes(payment.match.tenantBId);
      const updatedPayment = await tx.payment.update({ where: { id: payment.id }, data: { paidTenantIds, status: complete ? 'PAID' : 'READY', paidAt: complete ? (payment.paidAt || new Date()) : null } });
      if (complete) {
        await tx.chatSession.updateMany({ where: { matchId: payment.match.id, type: 'PRE_MOVE', deletedAt: null }, data: { status: 'READ_ONLY' } });
        await tx.chatSession.upsert({ where: { matchId_type: { matchId: payment.match.id, type: 'ROOMMATE' } }, update: { status: 'ACTIVE', expiresAt: null, deletedAt: null }, create: { matchId: payment.match.id, type: 'ROOMMATE', status: 'ACTIVE', expiresAt: null } });
        await tx.match.update({ where: { id: payment.match.id }, data: { status: 'CONFIRMED', confirmedAt: payment.match.confirmedAt || new Date() } });
      }
      return { payment: updatedPayment, allTenantsPaid: complete };
    });
    return res.json({ payment: result.payment, allTenantsPaid: result.allTenantsPaid, waitingForOtherTenant: !result.allTenantsPaid, deadlineMinutes: 10 });
  } catch (error) {
    if (error?.code === 'PAYMENT_NOT_FOUND') return res.status(404).json({ error: 'PAYMENT_NOT_FOUND' });
    if (error?.code === 'MATCH_NOT_ACCEPTED') return res.status(409).json({ error: 'MATCH_NOT_ACCEPTED' });
    return next(error);
  }
});

app.post('/api/v1/payments/:id/capture', requireToken, async (req, res, next) => {
  if (!databaseEnabled()) return next('route');
  try {
    const prisma = getPrisma();
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id }, include: { match: true } });
    if (!payment?.match || ![payment.match.tenantAId, payment.match.tenantBId].includes(req.auth.sub)) return res.status(404).json({ error: 'PAYMENT_NOT_FOUND' });
    const paidTenantIds = [...new Set([...(payment.paidTenantIds || []), req.auth.sub])];
    const complete = paidTenantIds.includes(payment.match.tenantAId) && paidTenantIds.includes(payment.match.tenantBId);
    const result = await prisma.$transaction(async (tx) => {
      const updatedPayment = await tx.payment.update({ where: { id: payment.id }, data: { paidTenantIds, status: complete ? 'PAID' : 'READY', paidAt: complete ? new Date() : null } });
      if (complete) {
        await tx.chatSession.updateMany({ where: { matchId: payment.match.id, type: 'PRE_MOVE', deletedAt: null }, data: { status: 'READ_ONLY' } });
        await tx.chatSession.upsert({ where: { matchId_type: { matchId: payment.match.id, type: 'ROOMMATE' } }, update: { status: 'ACTIVE', expiresAt: null, deletedAt: null }, create: { matchId: payment.match.id, type: 'ROOMMATE', status: 'ACTIVE', expiresAt: null } });
        await tx.match.update({ where: { id: payment.match.id }, data: { status: 'CONFIRMED', confirmedAt: new Date() } });
      }
      return updatedPayment;
    });
    return res.json({ payment: result, allTenantsPaid: complete, waitingForOtherTenant: !complete, deadlineMinutes: 10 });
  } catch (error) { return next(error); }
});

// Generate a reviewable agreement draft from ephemeral chat metadata/content.
// The transcript is used only for this request and is never written to the DB.
app.post('/api/v1/agreements/draft-from-chat', requireToken, async (req, res, next) => {
  if (!databaseEnabled()) return next('route');
  try {
    const matchId = String(req.body?.matchId || '');
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (!matchId || messages.length === 0) return res.status(400).json({ error: 'CHAT_MESSAGES_REQUIRED' });
    console.log('agreement_draft_started', { matchId, messageCount: messages.length });

    const prisma = getPrisma();
    const match = await prisma.match.findFirst({
      where: { id: matchId, deletedAt: null, OR: [{ tenantAId: req.auth.sub }, { tenantBId: req.auth.sub }] },
      select: { id: true, tenantAId: true, tenantBId: true, status: true },
    });
    if (!match) return res.status(404).json({ error: 'MATCH_NOT_FOUND' });
    if (!['ACCEPTED', 'CONFIRMED'].includes(match.status)) return res.status(409).json({ error: 'MATCH_NOT_READY_FOR_AGREEMENT' });

    const existing = await prisma.digitalAgreement.findUnique({ where: { matchId: match.id } });
    if (existing?.status === 'SIGNED') return res.status(409).json({ error: 'AGREEMENT_ALREADY_SIGNED' });

    let result;
    try {
      result = await draftAgreementFromMessages({ messages, tenantAId: match.tenantAId, tenantBId: match.tenantBId });
    } catch (error) {
      console.error('agreement_draft_llm_failed', error?.message || 'unknown_error');
      result = { draft: fallbackDraft, source: 'fallback_error' };
    }

    const rules = { ...result.draft, source: result.source, provider: result.provider || null, rawTranscriptStored: false, generatedAt: new Date().toISOString() };
    console.log('agreement_draft_source', { source: result.source, provider: result.provider || null });
    const agreement = await prisma.digitalAgreement.upsert({
      where: { matchId: match.id },
      update: { rules, status: 'DRAFT', deletedAt: null },
      create: { matchId: match.id, rules, status: 'DRAFT' },
    });
    return res.status(201).json({ agreement: { id: agreement.id, matchId: agreement.matchId, status: agreement.status, rules: agreement.rules }, source: result.source });
  } catch (error) { return next(error); }
});

// Mock-mode fallback for the chat inbox. The database routes above intentionally
// skip themselves when MOCK_MODE=true, so the demo must still expose the same
// API contract from the in-memory store.
const mockMatchesForUser = (userId) => [...store.matches.values()].filter((match) => match.memberIds.includes(userId));
const mockChatRoom = (match, userId, type) => {
  const partnerId = match.memberIds.find((memberId) => memberId !== userId);
  const partner = store.users.get(partnerId);
  const chat = store.chats.get(match.id) || store.chats.get(`${type}:${match.id}`);
  return {
    matchId: match.id,
    compatibility: match.compatibility,
    score: match.compatibility,
    partner: partner ? { id: partner.id, pseudonym: partner.pseudonym } : null,
    chat: chat ? { id: chat.id, matchId: match.id, expiresAt: chat.expiresAt, status: chat.status } : null,
    type,
  };
};

app.get('/api/v1/chat/requests', requireToken, (req, res, next) => {
  if (databaseEnabled()) return next('route');
  const requests = mockMatchesForUser(req.auth.sub)
    .filter((match) => match.status === 'proposed' && match.memberIds[1] === req.auth.sub)
    .map((match) => ({ id: match.id, from: store.users.get(match.memberIds[0]), compatibility: match.compatibility, score: match.compatibility, createdAt: match.createdAt }));
  return res.json({ requests });
});

app.get('/api/v1/chat/requests/sent', requireToken, (req, res, next) => {
  if (databaseEnabled()) return next('route');
  const requests = mockMatchesForUser(req.auth.sub)
    .filter((match) => match.status === 'proposed' && match.memberIds[0] === req.auth.sub)
    .map((match) => ({ id: match.id, to: store.users.get(match.memberIds[1]), compatibility: match.compatibility, score: match.compatibility, createdAt: match.createdAt }));
  return res.json({ requests });
});

app.post('/api/v1/chat/requests/:id/accept', requireToken, (req, res, next) => {
  if (databaseEnabled()) return next('route');
  const match = store.matches.get(req.params.id);
  if (!match || match.memberIds[1] !== req.auth.sub || match.status !== 'proposed') return res.status(404).json({ error: 'REQUEST_NOT_FOUND' });
  match.status = 'accepted';
  match.acceptedAt = match.acceptedAt || new Date().toISOString();
  return res.json({ accepted: true, match });
});

app.get('/api/v1/chat/rooms', requireToken, (req, res, next) => {
  if (databaseEnabled()) return next('route');
  const type = chatSessionType(req.query.type);
  const rooms = mockMatchesForUser(req.auth.sub)
    .filter((match) => ['accepted', 'confirmed'].includes(match.status))
    .filter((match) => type !== 'ROOMMATE' || match.status === 'confirmed')
    .map((match) => mockChatRoom(match, req.auth.sub, type));
  return res.json({ rooms });
});

const allowedConflictCategories = new Set(['noise', 'cleaning', 'guests', 'shared_space', 'sleep_schedule', 'communication', 'other']);
const allowedRoomTypes = new Set(['private_room', 'shared_room', 'multi_room']);
const allowedShareCounts = new Set([2, 3, 4]);
const allowedGenderPreferences = new Set(['any', 'female', 'male', 'non_binary']);
const allowedAgeBands = new Set(['any', '20s', '30s', '40_plus']);
const allowedGenders = new Set(['female', 'male', 'non_binary', 'prefer_not_to_say']);
const allowedPresenceStatuses = new Set(['available', 'sleeping', 'focus']);
const boundedInt = (value, min, max, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  const numeric = Number(value);
  return Number.isInteger(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
};
const normalizeConflictCategories = (categories) => Array.isArray(categories) ? [...new Set(categories.filter((category) => allowedConflictCategories.has(category)))].slice(0, 5) : [];
const getChatFeaturesForMatch = (matchId, tenantId) => store.chatMetrics.get(`${matchId}:${tenantId}`) || {};
const normalizeMatchingPreferences = (body = {}) => ({ roomType: allowedRoomTypes.has(body.roomType) ? body.roomType : 'private_room', shareCount: allowedShareCounts.has(Number(body.shareCount)) ? Number(body.shareCount) : 2, preferredGender: allowedGenderPreferences.has(body.preferredGender) ? body.preferredGender : 'any', ageBand: allowedAgeBands.has(body.ageBand) ? body.ageBand : 'any' });
const matchesAgeBand = (age, ageBand) => ageBand === 'any' || (ageBand === '20s' && age >= 20 && age < 30) || (ageBand === '30s' && age >= 30 && age < 40) || (ageBand === '40_plus' && age >= 40);
const matchesPreference = (user, preferences) => (preferences.preferredGender === 'any' || user.gender === preferences.preferredGender) && matchesAgeBand(Number(user.age), preferences.ageBand);

const recordOutcomeLabel = (input) => saveOutcomeLabel({
  ...input,
  store,
  createId,
  getChatFeatures: getChatFeaturesForMatch,
});

app.get('/health', (_req, res) => res.json({ ok: true, product: 'CheckMate', persistence: databaseEnabled() ? 'postgresql' : 'memory', realtime: redisClient ? 'redis' : 'memory' }));
app.post('/api/v1/auth/login', authLimiter, async (req, res, next) => { try { const user = await authenticateAccount(req.body.accountId, req.body.password); if (!user) return res.status(401).json({ error: 'INVALID_CREDENTIALS' }); return res.json({ accessToken: tokenFor(user), tokenType: 'Bearer', expiresInSeconds: 1800, variant: requestVariant(req), user: { id: user.id, accountId: user.accountId, pseudonym: user.pseudonym, role: user.role, operatorId: user.operatorId } }); } catch (error) { return next(error); } });
app.get('/api/v1/users/me', requireToken, async (req, res, next) => { try { if (databaseEnabled()) { const user = await getPrisma().tenant.findUnique({ where: { id: req.auth.sub }, select: { id: true, loginId: true, pseudonym: true, email: true, age: true, gender: true } }); if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' }); return res.json({ user: { ...user, accountId: user.loginId, gender: user.gender?.toLowerCase() || null } }); } const user = store.users.get(req.auth.sub); if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' }); return res.json({ user: { ...user } }); } catch (error) { return next(error); } });
app.patch('/api/v1/users/me', requireToken, async (req, res, next) => { try { if (req.auth.role !== 'tenant') return res.status(403).json({ error: 'TENANT_ROLE_REQUIRED' }); const pseudonym = typeof req.body.pseudonym === 'string' ? req.body.pseudonym.trim().slice(0, 80) : ''; const email = typeof req.body.email === 'string' ? req.body.email.trim().slice(0, 320) : null; const age = req.body.age === '' || req.body.age === null ? null : Number(req.body.age); const gender = req.body.gender || null; if (pseudonym.length < 2 || (email && !/^\S+@\S+\.\S+$/.test(email)) || (age !== null && (!Number.isInteger(age) || age < 18 || age > 100)) || (gender && !allowedGenders.has(gender))) return res.status(400).json({ error: 'INVALID_PROFILE' }); if (databaseEnabled()) { const user = await getPrisma().tenant.update({ where: { id: req.auth.sub }, data: { pseudonym, email, age, gender: gender ? gender.toUpperCase() : null }, select: { id: true, loginId: true, pseudonym: true, email: true, age: true, gender: true } }); return res.json({ user: { ...user, accountId: user.loginId, gender: user.gender?.toLowerCase() || null } }); } const user = store.users.get(req.auth.sub); if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' }); Object.assign(user, { pseudonym, email, age, gender }); return res.json({ user }); } catch (error) { return next(error); } });

const conditionLogs = new ConditionLogRepository();
const checkins = new CheckinRepository();
const conditionTypes = new Set(['SCRATCH', 'STAIN', 'DAMAGE', 'OTHER']);
app.post('/api/v1/rooms/:roomId/condition-logs', requireToken, requireDatabase, async (req, res, next) => { try { if (req.auth.role !== 'tenant') return res.status(403).json({ error: 'TENANT_ROLE_REQUIRED' }); if (!conditionTypes.has(req.body.type) || typeof req.body.imageUrl !== 'string' || !req.body.imageUrl.trim()) return res.status(400).json({ error: 'INVALID_CONDITION_LOG' }); const log = await conditionLogs.create({ roomId: req.params.roomId, reporterId: req.auth.sub, type: req.body.type, description: req.body.description, imageUrl: req.body.imageUrl.trim().slice(0, 2048) }); return res.status(201).json({ log }); } catch (error) { return next(error); } });
app.get('/api/v1/rooms/:roomId/condition-logs', requireToken, requireDatabase, async (req, res, next) => { try { const logs = await conditionLogs.listForRoom({ roomId: req.params.roomId, tenantId: req.auth.role === 'tenant' ? req.auth.sub : undefined, operatorId: req.auth.role === 'operator' ? req.auth.operatorId : undefined }); return res.json({ logs }); } catch (error) { return next(error); } });
app.get('/api/v1/care/checkins/pending', requireToken, requireDatabase, async (req, res, next) => { try { if (req.auth.role !== 'tenant') return res.status(403).json({ error: 'TENANT_ROLE_REQUIRED' }); return res.json({ checkins: await checkins.getPendingForTenant(req.auth.sub) }); } catch (error) { return next(error); } });
app.patch('/api/v1/care/checkins/:checkinId/answer', requireToken, requireDatabase, async (req, res, next) => { try { if (req.auth.role !== 'tenant') return res.status(403).json({ error: 'TENANT_ROLE_REQUIRED' }); const satisfaction = Number(req.body.satisfaction); if (!Number.isInteger(satisfaction) || satisfaction < 1 || satisfaction > 5) return res.status(400).json({ error: 'INVALID_SATISFACTION' }); const checkin = await checkins.submitAnswer({ checkinId: req.params.checkinId, tenantId: req.auth.sub, satisfaction, conflict: Boolean(req.body.conflict), label: typeof req.body.label === 'string' ? req.body.label.slice(0, 40) : null }); return res.json({ checkin }); } catch (error) { return next(error); } });

// Embedded B2B attribution: retained by operator and room, never by raw personal identifiers.
app.post('/api/v1/payments/:id/capture', requireToken, async (req, res, next) => { if (!databaseEnabled()) return next('route'); try { const prisma = getPrisma(); const payment = await prisma.payment.findUnique({ where: { id: req.params.id }, include: { match: true } }); if (!payment || !payment.match || ![payment.match.tenantAId, payment.match.tenantBId].includes(req.auth.sub)) return res.status(404).json({ error: 'PAYMENT_NOT_FOUND' }); const paidTenantIds = [...new Set([...(payment.paidTenantIds || []), req.auth.sub])]; const complete = paidTenantIds.includes(payment.match.tenantAId) && paidTenantIds.includes(payment.match.tenantBId); const updated = await prisma.payment.update({ where: { id: payment.id }, data: { paidTenantIds, status: complete ? 'PAID' : 'READY', paidAt: complete ? new Date() : null } }); return res.json({ payment: updated, allTenantsPaid: complete, waitingForOtherTenant: !complete, deadlineMinutes: 10 }); } catch (error) { return next(error); } });
app.post('/api/v1/funnel/events', (req, res) => { const { operatorId, roomId, funnelId, step } = req.body; if (!operatorId || !roomId || !funnelId || !step) return res.status(400).json({ error: 'ATTRIBUTION_FIELDS_REQUIRED' }); const event = { id: createId(), operatorId, roomId, funnelId, step, createdAt: new Date().toISOString() }; store.funnelEvents.push(event); res.status(201).json({ event }); });
app.post('/api/v1/consents', requireToken, (req, res) => { if (!req.body.agreed) return res.status(400).json({ error: 'CONSENT_REQUIRED' }); const consent = { userId: req.auth.sub, version: '2026-08', agreedAt: new Date().toISOString(), evidenceDigest: digest(`${req.auth.sub}:${req.body.operatorId}:${Date.now()}`) }; store.consents.set(req.auth.sub, consent); res.status(201).json({ consent: { version: consent.version, agreedAt: consent.agreedAt } }); });

// Only virtual identity and affiliation-email adapters are exposed. Provider receipts are digested immediately.
for (const type of ['identity', 'affiliation']) { app.post(`/api/v1/verifications/${type}/start`, requireToken, (req, res) => res.status(201).json({ transactionId: createId(), provider: type === 'identity' ? 'NICE_PASS_MOCK' : 'EMAIL_MOCK', expiresInSeconds: 300 })); app.post(`/api/v1/verifications/${type}/complete`, requireToken, (req, res) => { const result = { userId: req.auth.sub, type, status: req.body.outcome === 'failed' ? 'failed' : 'passed', evidenceDigest: digest(`${req.auth.sub}:${type}:${req.body.providerReceipt || createId()}`), verifiedAt: new Date().toISOString() }; store.verifications.set(`${req.auth.sub}:${type}`, result); res.json({ type, status: result.status }); }); }

app.put('/api/v1/behavior-profiles/me', requireToken, async (req, res, next) => { try { const keys = ['lateReturnBand', 'sleepTimeBand', 'wakeTimeBand', 'deliveryWasteBand', 'cleaningBand', 'noiseBand', 'guestFrequencyBand', 'cookingBand', 'commonSpaceBand']; const profile = Object.fromEntries(keys.map((key) => [key, Number(req.body[key])]).filter(([, value]) => Number.isInteger(value) && value >= 0 && value <= 3)); if (Object.keys(profile).length !== keys.length) return res.status(400).json({ error: 'INVALID_BEHAVIOR_FREQUENCY' }); const variant = requestVariant(req); const storedProfile = { ...profile, _meta: normalizeProfileMeta(req.body._meta, variant) }; const preferences = normalizeMatchingPreferences(req.body); const completedAt = new Date(); store.profiles.set(req.auth.sub, storedProfile); store.profileCompletedAt.set(req.auth.sub, completedAt.toISOString()); store.preferences.set(req.auth.sub, preferences); if (databaseEnabled()) await getPrisma().behaviorProfile.upsert({ where: { tenantId: req.auth.sub }, create: { tenantId: req.auth.sub, answers: storedProfile, completedAt }, update: { answers: storedProfile, completedAt, deletedAt: null } }); return res.json({ profile: storedProfile, preferences, variant, completed: true, completedAt: completedAt.toISOString() }); } catch (error) { return next(error); } });
app.get('/api/v1/behavior-profiles/me', requireToken, async (req, res, next) => { try { if (databaseEnabled()) { const profile = await getPrisma().behaviorProfile.findUnique({ where: { tenantId: req.auth.sub }, select: { answers: true, completedAt: true } }); return res.json({ profile: profile?.answers || null, completed: Boolean(profile?.completedAt), completedAt: profile?.completedAt || null }); } return res.json({ profile: store.profiles.get(req.auth.sub) || null, completed: Boolean(store.profileCompletedAt.get(req.auth.sub)), completedAt: store.profileCompletedAt.get(req.auth.sub) || null }); } catch (error) { return next(error); } });
// Database-backed matching flow. The legacy in-memory implementation below is used only in MOCK_MODE.
app.post('/api/v1/matches', requireToken, async (req, res, next) => { if (!databaseEnabled()) return next('route'); try { const prisma = getPrisma(); const candidateId = req.body.candidateId; const candidate = await prisma.tenant.findUnique({ where: { id: candidateId }, include: { behaviorProfile: true } }); const own = await prisma.behaviorProfile.findUnique({ where: { tenantId: req.auth.sub } }); if (!candidate?.behaviorProfile || !own?.completedAt) return res.status(400).json({ error: 'PROFILE_REQUIRED' }); const room = await prisma.room.findFirst({ where: { status: 'VACANT', deletedAt: null } }); if (!room) return res.status(409).json({ error: 'NO_AVAILABLE_ROOM' }); const existing = await prisma.match.findFirst({ where: { OR: [{ tenantAId: req.auth.sub, tenantBId: candidateId }, { tenantAId: candidateId, tenantBId: req.auth.sub }], roomId: room.id, deletedAt: null } }); if (existing) return res.json({ match: { id: existing.id, memberIds: [existing.tenantAId, existing.tenantBId], status: existing.status.toLowerCase() }, reused: true }); const reverse = await prisma.match.findFirst({ where: { tenantAId: candidateId, tenantBId: req.auth.sub, status: 'REQUESTED', deletedAt: null } }); const result = scoreCompatibility(own.answers, candidate.behaviorProfile.answers, store.rules); const match = reverse ? await prisma.match.update({ where: { id: reverse.id }, data: { status: 'ACCEPTED', acceptedAt: new Date(), compatibilityScore: result.score, scoreBreakdown: result.breakdown } }) : await prisma.match.create({ data: { tenantAId: req.auth.sub, tenantBId: candidateId, roomId: room.id, compatibilityScore: result.score, scoreBreakdown: result.breakdown, status: 'REQUESTED' } }); return res.status(reverse ? 200 : 201).json({ match: { id: match.id, memberIds: [match.tenantAId, match.tenantBId], status: match.status.toLowerCase(), compatibility: match.compatibilityScore, breakdown: match.scoreBreakdown }, mutual: Boolean(reverse) }); } catch (error) { return next(error); } });
app.get('/api/v1/chat/requests', requireToken, async (req, res, next) => { if (!databaseEnabled()) return next('route'); try { const rows = await getPrisma().match.findMany({ where: { tenantBId: req.auth.sub, status: 'REQUESTED', deletedAt: null }, include: { tenantA: { select: { id: true, pseudonym: true } } }, orderBy: { createdAt: 'desc' } }); return res.json({ requests: rows.map((row) => ({ id: row.id, from: row.tenantA, compatibility: row.compatibilityScore, score: row.compatibilityScore, createdAt: row.createdAt })) }); } catch (error) { return next(error); } });
app.get('/api/v1/chat/requests/sent', requireToken, async (req, res, next) => { if (!databaseEnabled()) return next('route'); try { const rows = await getPrisma().match.findMany({ where: { tenantAId: req.auth.sub, status: 'REQUESTED', deletedAt: null }, include: { tenantB: { select: { id: true, pseudonym: true } } }, orderBy: { createdAt: 'desc' } }); return res.json({ requests: rows.map((row) => ({ id: row.id, to: row.tenantB, compatibility: row.compatibilityScore, score: row.compatibilityScore, createdAt: row.createdAt })) }); } catch (error) { return next(error); } });
app.post('/api/v1/chat/requests/:id/accept', requireToken, async (req, res, next) => { if (!databaseEnabled()) return next('route'); try { const match = await getPrisma().match.updateMany({ where: { id: req.params.id, tenantBId: req.auth.sub, status: 'REQUESTED', deletedAt: null }, data: { status: 'ACCEPTED', acceptedAt: new Date() } }); if (match.count !== 1) return res.status(404).json({ error: 'REQUEST_NOT_FOUND' }); return res.json({ accepted: true }); } catch (error) { return next(error); } });
app.get('/api/v1/chat/rooms', requireToken, async (req, res, next) => { if (!databaseEnabled()) return next('route'); try { const rows = await getPrisma().match.findMany({ where: { OR: [{ tenantAId: req.auth.sub }, { tenantBId: req.auth.sub }], status: 'ACCEPTED', deletedAt: null }, include: { tenantA: { select: { id: true, pseudonym: true } }, tenantB: { select: { id: true, pseudonym: true } }, chatSession: true }, orderBy: { updatedAt: 'desc' } }); return res.json({ rooms: rows.map((row) => ({ matchId: row.id, compatibility: row.compatibilityScore, score: row.compatibilityScore, partner: row.tenantAId === req.auth.sub ? row.tenantB : row.tenantA, chat: row.chatSession })) }); } catch (error) { return next(error); } });
app.get('/api/v1/matches/candidates', requireToken, async (req, res, next) => { if (!databaseEnabled()) return next('route'); try { const prisma = getPrisma(); const own = await prisma.behaviorProfile.findUnique({ where: { tenantId: req.auth.sub } }); if (!own?.completedAt) return res.status(404).json({ error: 'PROFILE_NOT_FOUND' }); const variant = requestVariant(req); const profiles = await prisma.behaviorProfile.findMany({ where: { tenantId: { not: req.auth.sub }, completedAt: { not: null }, deletedAt: null }, include: { tenant: { select: { id: true, pseudonym: true, age: true, gender: true } } } }); const candidates = profiles.filter((item) => matchesVariant(own.answers, item.answers, variant)).map((item) => { const result = scoreCompatibility(own.answers, item.answers, store.rules); return { candidateId: item.tenantId, pseudonym: 'Anonymous tenant', compatibility: result.score, score: result.score, breakdown: result.breakdown, bestReasons: result.bestReasons, watchouts: result.watchouts, variant }; }); const activeMatch = await prisma.match.findFirst({ where: { OR: [{ tenantAId: req.auth.sub }, { tenantBId: req.auth.sub }], status: { in: ['ACCEPTED', 'CONFIRMED'] }, deletedAt: null }, select: { id: true, tenantAId: true, tenantBId: true, status: true, compatibilityScore: true, scoreBreakdown: true } }); const pendingMatch = await prisma.match.findFirst({ where: { OR: [{ tenantAId: req.auth.sub }, { tenantBId: req.auth.sub }], status: 'REQUESTED', deletedAt: null }, orderBy: { updatedAt: 'desc' }, select: { id: true, tenantAId: true, tenantBId: true, status: true, compatibilityScore: true, scoreBreakdown: true } }); const toMatchState = (row) => row ? { id: row.id, memberIds: [row.tenantAId, row.tenantBId], status: row.status.toLowerCase(), compatibility: row.compatibilityScore, score: row.compatibilityScore, breakdown: row.scoreBreakdown } : null; const selected = activeMatch || pendingMatch; const selectedCandidate = selected ? candidates.find((candidate) => selected.memberIds.includes(candidate.candidateId)) : null; return res.json({ rules: store.rules, variant, preferences: {}, totalCandidates: candidates.length, recommended: selectedCandidate || candidates[0] || null, activeMatch: toMatchState(activeMatch), pendingMatch: toMatchState(pendingMatch), candidates }); } catch (error) { return next(error); } });
app.post('/api/v1/matches', requireToken, async (req, res, next) => { if (!databaseEnabled()) return next('route'); try { const prisma = getPrisma(); const candidateId = req.body.candidateId; const candidate = await prisma.tenant.findUnique({ where: { id: candidateId }, include: { behaviorProfile: true } }); const own = await prisma.behaviorProfile.findUnique({ where: { tenantId: req.auth.sub } }); if (!candidate?.behaviorProfile || !own?.completedAt) return res.status(400).json({ error: 'PROFILE_REQUIRED' }); const existingPair = await prisma.match.findFirst({ where: { OR: [{ tenantAId: req.auth.sub, tenantBId: candidateId }, { tenantAId: candidateId, tenantBId: req.auth.sub }], status: { in: ['REQUESTED', 'ACCEPTED', 'CONFIRMED'] }, deletedAt: null }, orderBy: { updatedAt: 'desc' } }); if (existingPair) return res.json({ match: { id: existingPair.id, memberIds: [existingPair.tenantAId, existingPair.tenantBId], status: existingPair.status.toLowerCase(), compatibility: existingPair.compatibilityScore, breakdown: existingPair.scoreBreakdown }, reused: true, mutual: existingPair.status !== 'REQUESTED' }); const existingForUser = await prisma.match.findFirst({ where: { OR: [{ tenantAId: req.auth.sub }, { tenantBId: req.auth.sub }], status: { in: ['REQUESTED', 'ACCEPTED', 'CONFIRMED'] }, deletedAt: null }, orderBy: { updatedAt: 'desc' } }); if (existingForUser) return res.status(409).json({ error: 'MATCH_ALREADY_IN_PROGRESS', match: { id: existingForUser.id, memberIds: [existingForUser.tenantAId, existingForUser.tenantBId], status: existingForUser.status.toLowerCase() } }); const room = await prisma.room.findFirst({ where: { status: 'VACANT', deletedAt: null } }); if (!room) return res.status(409).json({ error: 'NO_AVAILABLE_ROOM' }); const reverse = await prisma.match.findFirst({ where: { tenantAId: candidateId, tenantBId: req.auth.sub, status: 'REQUESTED', deletedAt: null } }); const result = scoreCompatibility(own.answers, candidate.behaviorProfile.answers, store.rules); const match = reverse ? await prisma.match.update({ where: { id: reverse.id }, data: { status: 'ACCEPTED', acceptedAt: new Date(), compatibilityScore: result.score, scoreBreakdown: result.breakdown } }) : await prisma.match.create({ data: { tenantAId: req.auth.sub, tenantBId: candidateId, roomId: room.id, compatibilityScore: result.score, scoreBreakdown: result.breakdown, status: 'REQUESTED' } }); return res.status(reverse ? 200 : 201).json({ match: { id: match.id, memberIds: [match.tenantAId, match.tenantBId], status: match.status.toLowerCase(), compatibility: match.compatibilityScore, breakdown: match.scoreBreakdown }, mutual: Boolean(reverse) }); } catch (error) { return next(error); } });
 app.post('/api/v1/matches/:id/preauthorize', requireToken, async (req, res, next) => { if (!databaseEnabled()) return next('route'); try { const prisma = getPrisma(); const match = await prisma.match.findFirst({ where: { id: req.params.id, OR: [{ tenantAId: req.auth.sub }, { tenantBId: req.auth.sub }], deletedAt: null } }); if (!match) return res.status(404).json({ error: 'MATCH_NOT_FOUND' }); if (!['ACCEPTED', 'CONFIRMED'].includes(match.status)) return res.status(409).json({ error: 'MATCH_NOT_ACCEPTED' }); const payment = await prisma.payment.upsert({ where: { matchId: match.id }, update: {}, create: { matchId: match.id, amountKrw: Number(req.body.amountKrw) || 30000, status: 'READY', provider: 'PG_PREAUTH', idempotencyKey: `preauth:${match.id}` } }); return res.status(201).json({ payment }); } catch (error) { return next(error); } });
app.post('/api/v1/matches/:id/chat-sessions', requireToken, async (req, res, next) => { if (!databaseEnabled()) return next('route'); try { const prisma = getPrisma(); const match = await prisma.match.findFirst({ where: { id: req.params.id, OR: [{ tenantAId: req.auth.sub }, { tenantBId: req.auth.sub }], deletedAt: null } }); if (!match) return res.status(404).json({ error: 'MATCH_NOT_FOUND' }); const existing = await prisma.chatSession.findUnique({ where: { matchId: match.id } }); if (existing && existing.expiresAt > new Date() && existing.status === 'ACTIVE') return res.json({ chat: { id: existing.id, matchId: existing.matchId, expiresAt: existing.expiresAt, reused: true } }); const chat = await prisma.chatSession.upsert({ where: { matchId: match.id }, update: { status: 'ACTIVE', expiresAt: new Date(Date.now() + 1800000), deletedAt: null }, create: { matchId: match.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 1800000) } }); return res.status(201).json({ chat: { id: chat.id, matchId: chat.matchId, expiresAt: chat.expiresAt } }); } catch (error) { return next(error); } });
app.get('/api/v1/matches/candidates', requireToken, (req, res) => { const own = store.profiles.get(req.auth.sub); if (!own) return res.status(404).json({ error: 'PROFILE_NOT_FOUND' }); const variant = requestVariant(req); const preferences = store.preferences.get(req.auth.sub) || normalizeMatchingPreferences(); const users = [...store.users.values()].filter((user) => user.role === 'tenant' && user.id !== req.auth.sub && store.profiles.has(user.id)); const filteredUsers = users.filter((user) => matchesPreference(user, preferences) && matchesVariant(own, store.profiles.get(user.id), variant)); const activeMatch = [...store.matches.values()].find((item) => item.memberIds.includes(req.auth.sub) && ['accepted', 'confirmed'].includes(item.status)); const candidates = rankCandidates(own, filteredUsers, store.profiles, store.rules).map((candidate) => ({ ...candidate, variant, preferences, ...(activeMatch?.memberIds.includes(candidate.candidateId) ? { matchId: activeMatch.id, status: activeMatch.status, accepted: true } : {}) })); res.json({ rules: store.rules, variant, preferences, totalCandidates: candidates.length, recommended: candidates[0] || null, activeMatch: activeMatch || null, candidates }); });
app.put('/api/v1/operators/matching-rules/:key', requireToken, requireOperator, (req, res) => { const rule = store.rules.find((item) => item.key === req.params.key); if (!rule || !Number.isFinite(req.body.weight)) return res.status(400).json({ error: 'INVALID_RULE_UPDATE' }); rule.weight = Math.max(0, Math.min(100, req.body.weight)); res.json({ rule }); });
app.post('/api/v1/matches', requireToken, (req, res) => { const existing = [...store.matches.values()].find((item) => item.memberIds.includes(req.auth.sub) && ['proposed', 'accepted', 'confirmed'].includes(item.status)); if (existing) { if (existing.status === 'proposed') { existing.status = 'accepted'; existing.acceptedAt = existing.acceptedAt || new Date().toISOString(); } return res.json({ match: existing, reused: true }); } const candidate = store.users.get(req.body.candidateId); if (!candidate || candidate.role !== 'tenant' || candidate.id === req.auth.sub) return res.status(400).json({ error: 'INVALID_CANDIDATE' }); const own = store.profiles.get(req.auth.sub); const other = store.profiles.get(candidate.id); if (!own || !other) return res.status(400).json({ error: 'PROFILE_REQUIRED' }); if (!matchesVariant(own, other, requestVariant(req))) return res.status(409).json({ error: 'VARIANT_MATCH_REQUIRED' }); const result = scoreCompatibility(own, other, store.rules); const preferences = store.preferences.get(req.auth.sub) || normalizeMatchingPreferences(); const nowIso = new Date().toISOString(); const match = { id: createId(), memberIds: [req.auth.sub, candidate.id], compatibility: result.score, breakdown: result.breakdown, bestReasons: result.bestReasons, watchouts: result.watchouts, preferences, variant: requestVariant(req), status: 'accepted', acceptedAt: nowIso, createdAt: nowIso }; store.matches.set(match.id, match); res.status(201).json({ match }); });
app.post('/api/v1/payments/:id/capture', requireToken, (req, res) => { const payment = store.payments.get(req.params.id); if (!payment || payment.userId !== req.auth.sub) return res.status(404).json({ error: 'PAYMENT_NOT_FOUND' }); if (!['authorized', 'paid'].includes(payment.status)) return res.status(409).json({ error: 'PAYMENT_NOT_CAPTUREABLE' }); payment.status = 'paid'; payment.transactionId = payment.transactionId || 'PG-MOCK-' + createId(); payment.capturedAt = new Date().toISOString(); res.json({ payment }); });
app.post('/api/v1/matches/:id/preauthorize', requireToken, (req, res) => { const match = store.matches.get(req.params.id); if (!match?.memberIds.includes(req.auth.sub)) return res.status(404).json({ error: 'MATCH_NOT_FOUND' }); const existing = [...store.payments.values()].find((payment) => payment.matchId === match.id && ['authorized', 'paid'].includes(payment.status)); if (existing) return res.json({ payment: existing, reused: true }); const nowIso = new Date().toISOString(); const payment = { id: createId(), matchId: match.id, userId: req.auth.sub, amountKrw: 30000, status: 'authorized', provider: 'PG_MOCK', transactionId: null, authorizedAt: nowIso, releasePolicy: 'decline_after_chat_or_capture_on_contract', createdAt: nowIso }; store.payments.set(payment.id, payment); res.status(201).json({ payment, hold: { amountKrw: 30000, message: '癲????????좊읈????????筌??????? ????繹?癲꾧퀗?????????筌????爾????寃뗏? ????뉖짉 ?嶺뚮Ĳ?????癲ル슔?됭짆?륂렭????????筌뤾퍓???' } }); });
app.post('/api/v1/matches/:id/chat-sessions', requireToken, async (req, res) => { const match = store.matches.get(req.params.id); if (!match?.memberIds.includes(req.auth.sub)) return res.status(404).json({ error: 'MATCH_NOT_FOUND' }); const existing = [...store.chats.values()].find((chat) => chat.status === 'active' && Date.parse(chat.expiresAt) > Date.now() && store.matches.get(chat.matchId)?.memberIds.includes(req.auth.sub)); if (existing) return res.json({ chat: { id: existing.id, matchId: existing.matchId, expiresAt: existing.expiresAt, reused: true } }); const chat = { id: createId(), matchId: match.id, expiresAt: new Date(Date.now() + 1800000).toISOString(), status: 'active', messages: [] }; store.chats.set(match.id, chat); if (redisClient) await redisClient.setEx(`chat:${match.id}:meta`, 1800, JSON.stringify({ id: chat.id, matchId: chat.matchId, expiresAt: chat.expiresAt, status: chat.status })); res.status(201).json({ chat: { id: chat.id, matchId: chat.matchId, expiresAt: chat.expiresAt } }); });
app.post('/api/v1/matches/:id/chat-behavior', requireToken, async (req, res) => { const match = store.matches.get(req.params.id); if (!match?.memberIds.includes(req.auth.sub)) return res.status(404).json({ error: 'MATCH_NOT_FOUND' }); const sentMessageCount = boundedInt(req.body.sentMessageCount, 0, 500); const receivedMessageCount = boundedInt(req.body.receivedMessageCount, 0, 500); const firstResponseLatencyMs = boundedInt(req.body.firstResponseLatencyMs, 0, 1800000, null); const averageResponseLatencyMs = boundedInt(req.body.averageResponseLatencyMs, 0, 1800000, null); const activeSeconds = boundedInt(req.body.activeSeconds, 0, 1800); const acceptanceLatencyMs = boundedInt(req.body.acceptanceLatencyMs, 0, 86400000, null); const firstMessageAt = typeof req.body.firstMessageAt === 'string' && !Number.isNaN(Date.parse(req.body.firstMessageAt)) ? req.body.firstMessageAt : null; const responseScore = firstResponseLatencyMs === null ? 0 : Math.max(0, 30 - Math.round(firstResponseLatencyMs / 60000) * 5); const proactivityScore = Math.min(100, Math.max(0, (firstMessageAt ? 35 : 0) + Math.min(35, sentMessageCount * 5) + Math.min(20, receivedMessageCount * 4) + responseScore + Math.min(10, Math.round(activeSeconds / 180)))); const metric = { matchId: match.id, tenantId: req.auth.sub, firstMessageAt, firstResponseLatencyMs, averageResponseLatencyMs, sentMessageCount, receivedMessageCount, activeSeconds, acceptanceLatencyMs, proactivityScore, updatedAt: new Date().toISOString() }; store.chatMetrics.set(`${match.id}:${req.auth.sub}`, metric); if (redisClient) { const ttl = Math.max(1, Math.ceil((Date.parse(store.chats.get(match.id)?.expiresAt || new Date().toISOString()) - Date.now()) / 1000)); await redisClient.setEx(`chat:${match.id}:behavior:${req.auth.sub}`, ttl, JSON.stringify(metric)); } res.status(201).json({ metric: { sentMessageCount, receivedMessageCount, averageResponseLatencyMs, activeSeconds, proactivityScore } }); });

// DND presence is visible only to the two people in the same accepted match.
// It automatically expires so a forgotten status never becomes misleading.
app.get('/api/v1/matches/:id/presence', requireToken, (req, res) => { const match = store.matches.get(req.params.id); if (!match?.memberIds.includes(req.auth.sub) || !['accepted', 'confirmed'].includes(match.status)) return res.status(404).json({ error: 'MATCH_NOT_FOUND' }); const nowMs = Date.now(); const statuses = match.memberIds.map((memberId) => store.presence.get(`${match.id}:${memberId}`)).filter(Boolean).filter((item) => Date.parse(item.expiresAt) > nowMs); for (const item of statuses) store.presence.set(`${match.id}:${item.userId}`, item); res.json({ statuses: statuses.map((item) => ({ status: item.status, expiresAt: item.expiresAt, isSelf: item.userId === req.auth.sub })) }); });
app.put('/api/v1/matches/:id/presence/me', requireToken, (req, res) => { const match = store.matches.get(req.params.id); const status = req.body?.status; if (!match?.memberIds.includes(req.auth.sub) || !['accepted', 'confirmed'].includes(match.status)) return res.status(404).json({ error: 'MATCH_NOT_FOUND' }); if (!allowedPresenceStatuses.has(status)) return res.status(400).json({ error: 'INVALID_PRESENCE_STATUS' }); const key = `${match.id}:${req.auth.sub}`; if (status === 'available') { store.presence.delete(key); return res.json({ status: 'available', expiresAt: null }); } const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(); store.presence.set(key, { userId: req.auth.sub, status, expiresAt }); return res.json({ status, expiresAt }); });
app.post('/api/v1/contracts', requireToken, (req, res) => { const contract = { id: createId(), userId: req.auth.sub, matchId: req.body.matchId || null, operatorId: req.body.operatorId, roomId: req.body.roomId, moveInDate: req.body.moveInDate || new Date().toISOString(), status: 'confirmed' }; contract.checkinDueAt = new Date(Date.parse(contract.moveInDate) + 30 * 86400000).toISOString(); contract.checkin90DueAt = new Date(Date.parse(contract.moveInDate) + 90 * 86400000).toISOString(); store.contracts.set(contract.id, contract); store.checkins.set(`${contract.id}:30`, { contractId: contract.id, checkpoint: 30, dueAt: contract.checkinDueAt, status: 'scheduled' }); store.checkins.set(`${contract.id}:90`, { contractId: contract.id, checkpoint: 90, dueAt: contract.checkin90DueAt, status: 'scheduled' }); res.status(201).json({ contract, reservation: { amountKrw: 30000, provider: 'PG_MOCK', status: 'paid' } }); });
app.post('/api/v1/checkins/:contractId/response', requireToken, (req, res) => { const checkin = store.checkins.get(req.params.contractId) || store.checkins.get(`${req.params.contractId}:${req.body.checkpoint || 30}`); if (!checkin) return res.status(404).json({ error: 'CHECKIN_NOT_FOUND' }); const satisfaction = Number(req.body.satisfaction); if (!Number.isInteger(satisfaction) || satisfaction < 1 || satisfaction > 5) return res.status(400).json({ error: 'INVALID_SATISFACTION' }); const contract = store.contracts.get(req.params.contractId); const userId = contract?.userId || req.auth.sub; if (contract?.userId && contract.userId !== req.auth.sub) return res.status(403).json({ error: 'CHECKIN_SCOPE_REQUIRED' }); checkin.status = 'responded'; checkin.satisfaction = satisfaction; checkin.conflict = Boolean(req.body.conflict); checkin.conflictCategories = normalizeConflictCategories(req.body.conflictCategories); checkin.label = checkin.conflict ? 'needs_rematch' : satisfaction >= 4 ? 'stable' : 'needs_mediation'; const outcome = recordOutcomeLabel({ contractId: req.params.contractId, userId, checkpoint: Number(req.body.checkpoint || checkin.checkpoint || 30), satisfaction, conflict: checkin.conflict, earlyExit: Boolean(req.body.earlyExit), conflictCategories: checkin.conflictCategories }); res.json({ checkin, trainingLabel: outcome.feedback, patternAggregate: outcome.aggregate }); });

// Digital agreement: rules are derived from both profiles before either party signs.
app.post('/api/v1/agreements/draft-from-chat', requireToken, (req, res) => { const matchId = String(req.body?.matchId || ''); const messages = Array.isArray(req.body?.messages) ? req.body.messages : []; if (!matchId || messages.length === 0) return res.status(400).json({ error: 'CHAT_MESSAGES_REQUIRED' }); const existing = [...store.agreements.values()].find((item) => item.matchId === matchId); const agreement = existing || { id: createId(), userId: req.auth.sub, matchId, roomId: null, signatures: { [req.auth.sub]: null }, createdAt: new Date().toISOString() }; agreement.rules = { ...fallbackDraft, source: 'mock_no_api_key', rawTranscriptStored: false, generatedAt: new Date().toISOString() }; agreement.status = 'draft'; store.agreements.set(agreement.id, agreement); res.status(201).json({ agreement, source: 'mock_no_api_key' }); });
app.post('/api/v1/agreements', requireToken, (req, res) => { const agreement = { id: createId(), userId: req.auth.sub, matchId: req.body.matchId || null, roomId: req.body.roomId || null, rules: req.body.rules || [{ key: 'cleaning', text: 'Clean shared areas weekly' }, { key: 'quietHours', text: 'Keep shared areas quiet after 23:00' }, { key: 'guests', text: 'Notify before bringing guests' }], signatures: { [req.auth.sub]: null }, status: 'pending', createdAt: new Date().toISOString() }; store.agreements.set(agreement.id, agreement); res.status(201).json({ agreement }); });
app.post('/api/v1/agreements/:id/sign', requireToken, (req, res) => { const agreement = store.agreements.get(req.params.id); if (!agreement) return res.status(404).json({ error: 'AGREEMENT_NOT_FOUND' }); agreement.signatures[req.auth.sub] = { signedAt: new Date().toISOString(), evidenceDigest: digest(`${agreement.id}:${req.auth.sub}:${Date.now()}`) }; agreement.status = 'signed_by_user'; res.json({ agreement }); });

// Mediation ticket: the user does not need to confront the roommate directly.
app.post('/api/v1/mediation-tickets', requireToken, (req, res) => { if (!req.body.roomId || !req.body.operatorId || !req.body.category || !req.body.description) return res.status(400).json({ error: 'TICKET_FIELDS_REQUIRED' }); const caseTickets = [...store.tickets.values()].filter((item) => item.roomId === req.body.roomId && (req.body.matchId ? item.matchId === req.body.matchId : true)); const sequence = caseTickets.length + 1; const guaranteeEligible = sequence >= 3; const nowIso = new Date().toISOString(); const ticket = { id: createId(), reporterId: req.auth.sub, operatorId: req.body.operatorId, roomId: req.body.roomId, matchId: req.body.matchId || null, agreementId: req.body.agreementId || null, category: req.body.category, description: String(req.body.description).slice(0, 2000), severity: req.body.severity || 'medium', status: guaranteeEligible ? 'replacement_pending' : 'open', guaranteeStatus: guaranteeEligible ? 'eligible' : 'none', sequence, createdAt: nowIso, updatedAt: nowIso, webhookNotifiedAt: nowIso }; store.tickets.set(ticket.id, ticket); store.notifications.push({ type: guaranteeEligible ? 'ROOMMATE_REPLACEMENT_GUARANTEE_TRIGGERED' : 'MEDIATION_TICKET_OPENED', ticketId: ticket.id, roomId: ticket.roomId, sequence, webhook: { operatorId: ticket.operatorId, status: ticket.status }, createdAt: nowIso }); res.status(201).json({ ticket, guarantee: { eligible: guaranteeEligible, status: ticket.guaranteeStatus, trigger: guaranteeEligible ? 'THREE_TICKETS_IN_CASE' : null } }); });
app.get('/api/v1/mediation-tickets/me', requireToken, (req, res) => { const tickets = [...store.tickets.values()].filter((ticket) => ticket.reporterId === req.auth.sub && (!req.query.roomId || ticket.roomId === req.query.roomId) && ticket.status !== 'closed').sort((a, b) => b.createdAt.localeCompare(a.createdAt)); res.json({ tickets }); });
app.patch('/api/v1/mediation-tickets/:ticketId/status', requireToken, requireOperator, (req, res) => { const ticket = store.tickets.get(req.params.ticketId); if (!ticket) return res.status(404).json({ error: 'TICKET_NOT_FOUND' }); const allowed = new Set(['in_review', 'replacement_approved', 'resolved', 'closed']); if (!allowed.has(req.body.status)) return res.status(400).json({ error: 'INVALID_TICKET_STATUS' }); if (req.body.status === 'replacement_approved' && ticket.guaranteeStatus !== 'eligible') return res.status(409).json({ error: 'GUARANTEE_NOT_ELIGIBLE' }); ticket.status = req.body.status; ticket.updatedAt = new Date().toISOString(); if (req.body.status === 'replacement_approved') ticket.guaranteeStatus = 'approved'; if (['resolved', 'closed'].includes(req.body.status)) ticket.resolvedAt = ticket.updatedAt; store.notifications.push({ type: 'MEDIATION_TICKET_STATUS_CHANGED', ticketId: ticket.id, status: ticket.status, createdAt: ticket.updatedAt }); res.json({ ticket }); });
app.get('/api/v1/operators/:operatorId/mediation-tickets', requireToken, requireOperator, (req, res) => res.json({ tickets: [...store.tickets.values()].filter((ticket) => ticket.operatorId === req.params.operatorId && ticket.status !== 'closed').sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }));

// 30/90-day feedback becomes a training label and nudges the relevant rule weight.
app.post('/api/v1/feedback', requireToken, (req, res) => { const checkpoint = Number(req.body.checkpoint); const satisfaction = Number(req.body.satisfaction); if (![30, 90].includes(checkpoint)) return res.status(400).json({ error: 'CHECKPOINT_MUST_BE_30_OR_90' }); if (!Number.isInteger(satisfaction) || satisfaction < 1 || satisfaction > 5) return res.status(400).json({ error: 'INVALID_SATISFACTION' }); const outcome = recordOutcomeLabel({ contractId: req.body.contractId, userId: req.auth.sub, checkpoint, satisfaction, conflict: Boolean(req.body.conflict), earlyExit: Boolean(req.body.earlyExit), conflictCategories: req.body.conflictCategories, source: 'feedback_api' }); res.status(201).json({ feedback: outcome.feedback, patternAggregate: outcome.aggregate, updatedRule: outcome.updatedRule }); });
app.get('/api/v1/operators/:operatorId/feedback-insights', requireToken, requireOperator, (req, res) => { if (req.auth.operatorId !== req.params.operatorId) return res.status(403).json({ error: 'OPERATOR_SCOPE_REQUIRED' }); const labels = [...store.feedback.values()]; const conflicts = labels.filter((item) => item.label === 'compatibility_risk'); const categories = conflicts.flatMap((item) => item.conflictCategories || []).reduce((counts, category) => ({ ...counts, [category]: (counts[category] || 0) + 1 }), {}); res.json({ trainingSamples: labels.length, conflictSamples: conflicts.length, stableSamples: labels.filter((item) => item.label === 'stable_match').length, conflictCategories: categories, topPatterns: [...store.patternAggregates.values()].sort((a, b) => b.conflictSamples - a.conflictSamples).slice(0, 10) }); });
app.get('/api/v1/operators/:operatorId/dashboard', requireToken, requireOperator, (req, res) => { if (req.auth.operatorId !== req.params.operatorId) return res.status(403).json({ error: 'OPERATOR_SCOPE_REQUIRED' }); const events = store.funnelEvents.filter(item => item.operatorId === req.params.operatorId); const count = (step, fallback) => { const value = new Set(events.filter(item => item.step === step).map(item => item.funnelId)).size; return value || fallback; }; const tickets = [...store.tickets.values()].filter(ticket => ticket.operatorId === req.params.operatorId && ticket.status !== 'closed'); res.json({ kpis: [{ label: 'Monthly entries', value: String(count('entry', 248)), change: '+12%' }, { label: 'Verification complete', value: '82%', change: '+6.4%p' }, { label: 'Match success', value: '61%', change: '+8.1%p' }, { label: '30-day retention', value: '94%', change: '+4.0%p' }], funnel: [{ label: 'Entry', value: count('entry', 248) }, { label: 'Survey', value: count('survey', 203) }, { label: 'Match', value: count('match', 149) }, { label: 'Move-in', value: count('contract_confirmed', 91) }], openMediationTickets: tickets.length, recentTickets: tickets.slice(0, 5) }); });
io.use((socket, next) => { try { socket.user = jwt.verify(socket.handshake.auth?.token, JWT_SECRET, { issuer: 'checkmate' }); next(); } catch { next(new Error('UNAUTHORIZED')); } });
// Typed transport used by the two chat lifecycles. Legacy events below remain
// available for existing clients, while these events isolate Redis rooms and
// enforce match membership before joining or sending.
io.on('connection', (socket) => {
  socket.on('chat:join:typed', async ({ matchId, type = 'PRE_MOVE' } = {}, callback) => {
    const sessionType = chatSessionType(type);
    let match = null;
    let session = null;
    if (databaseEnabled()) {
      match = await getPrisma().match.findFirst({ where: { id: matchId, deletedAt: null, OR: [{ tenantAId: socket.user.sub }, { tenantBId: socket.user.sub }] } }).catch(() => null);
      session = match ? await getPrisma().chatSession.findUnique({ where: { matchId_type: { matchId, type: sessionType } } }).catch(() => null) : null;
    } else {
      match = store.matches.get(matchId);
      session = store.chats.get(`${sessionType}:${matchId}`) || store.chats.get(matchId);
    }
    if (!match || !session || (databaseEnabled() && sessionType === 'ROOMMATE' && match.status !== 'CONFIRMED')) return callback?.({ error: 'CHAT_ACCESS_DENIED' });
    if (String(session.status).toUpperCase() !== 'ACTIVE' || (session.expiresAt && Date.parse(session.expiresAt) <= Date.now())) return callback?.({ error: 'CHAT_UNAVAILABLE' });
    const roomName = chatRoomName(sessionType, matchId);
    socket.join(roomName);
    const metaKey = chatMetaKey(sessionType, matchId);
    if (redisClient && databaseEnabled()) await redisClient.setEx(metaKey, sessionType === 'ROOMMATE' ? 60 * 60 * 24 * 365 : Math.max(1, Math.ceil((Date.parse(session.expiresAt) - Date.now()) / 1000)), JSON.stringify({ id: session.id, matchId, type: sessionType, expiresAt: session.expiresAt, status: session.status.toLowerCase() }));
    const messages = redisClient ? (await redisClient.lRange(chatMessageKey(sessionType, matchId), 0, -1)).map(JSON.parse) : (session.messages || []);
    return callback?.({ ok: true, type: sessionType, expiresAt: session.expiresAt, messages });
  });
  socket.on('chat:message:typed', async ({ matchId, type = 'PRE_MOVE', text } = {}, callback) => {
    const sessionType = chatSessionType(type);
    const roomName = chatRoomName(sessionType, matchId);
    const match = databaseEnabled() ? await getPrisma().match.findFirst({ where: { id: matchId, deletedAt: null, OR: [{ tenantAId: socket.user.sub }, { tenantBId: socket.user.sub }] } }).catch(() => null) : store.matches.get(matchId);
    if (!match || !socket.rooms.has(roomName)) return callback?.({ error: 'CHAT_ACCESS_DENIED' });
    const session = databaseEnabled() ? await getPrisma().chatSession.findUnique({ where: { matchId_type: { matchId, type: sessionType } } }).catch(() => null) : (store.chats.get(`${sessionType}:${matchId}`) || store.chats.get(matchId));
    const rawText = typeof text === 'string' ? text.trim() : '';
    if (!session || String(session.status).toUpperCase() !== 'ACTIVE' || (session.expiresAt && Date.parse(session.expiresAt) <= Date.now()) || !rawText || rawText.length > 500) return callback?.({ error: 'MESSAGE_REJECTED' });
    const filtered = maskContactInfo(rawText);
    const message = { id: createId(), sentAt: new Date().toISOString(), from: socket.user.sub, text: filtered.text, contactMasked: filtered.detected };
    if (redisClient) { const ttl = session.expiresAt ? Math.max(1, Math.ceil((Date.parse(session.expiresAt) - Date.now()) / 1000)) : 60 * 60 * 24 * 365; await redisClient.multi().rPush(chatMessageKey(sessionType, matchId), JSON.stringify(message)).expire(chatMessageKey(sessionType, matchId), ttl).exec(); }
    else if (session.messages) session.messages.push(message);
    io.to(roomName).emit('chat:message:typed', message);
    if (filtered.detected) socket.emit('chat:policy-warning', { message: '연락처 공유는 안심 채팅에서 제한됩니다.' });
    return callback?.({ ok: true, contactMasked: filtered.detected });
  });
});
// Hydrate DB-backed chat sessions into the Redis/memory transport before the legacy socket handlers run.
io.on('connection', (socket) => { socket.on('chat:join', async ({ matchId }) => { if (store.chats.has(matchId) || !databaseEnabled()) return; const session = await getPrisma().chatSession.findUnique({ where: { matchId } }).catch(() => null); if (session) store.chats.set(matchId, { id: session.id, matchId, expiresAt: session.expiresAt.toISOString(), status: session.status.toLowerCase(), messages: [] }); }); });
io.on('connection', (socket) => { socket.on('chat:join', async ({ matchId }, callback) => { let chat = store.chats.get(matchId); if (!chat && redisClient) { const metadata = await redisClient.get(`chat:${matchId}:meta`); if (metadata) { chat = JSON.parse(metadata); chat.messages = []; store.chats.set(matchId, chat); } } if (!chat || chat.status !== 'active' || Date.parse(chat.expiresAt) <= Date.now()) return callback?.({ error: 'CHAT_UNAVAILABLE' }); socket.join(`chat:${matchId}`); const messages = redisClient ? (await redisClient.lRange(`chat:${matchId}:messages`, 0, -1)).map(JSON.parse) : chat.messages; return callback?.({ ok: true, expiresAt: chat.expiresAt, messages }); }); socket.on('chat:message', async ({ matchId, text }, callback) => { let chat = store.chats.get(matchId); if (!chat && redisClient) { const metadata = await redisClient.get(`chat:${matchId}:meta`); if (metadata) { chat = JSON.parse(metadata); chat.messages = []; store.chats.set(matchId, chat); } } const rawText = typeof text === 'string' ? text.trim() : ''; if (!chat || chat.status !== 'active' || Date.parse(chat.expiresAt) <= Date.now() || !rawText || rawText.length > 500) return callback?.({ error: 'MESSAGE_REJECTED' }); const filtered = maskContactInfo(rawText); const message = { id: createId(), sentAt: new Date().toISOString(), from: socket.user.sub, text: filtered.text, contactMasked: filtered.detected }; const ttl = Math.max(1, Math.ceil((Date.parse(chat.expiresAt) - Date.now()) / 1000)); if (redisClient) await redisClient.multi().rPush(`chat:${matchId}:messages`, JSON.stringify(message)).expire(`chat:${matchId}:messages`, ttl).exec(); else chat.messages.push(message); io.to(`chat:${matchId}`).emit('chat:message', message); if (filtered.detected) socket.emit('chat:policy-warning', { message: '???源놁벁??癲ル슢????닱????ш낄援?????ㅻ깹??異????????????モ뵲???寃뗏????怨?????덊렡. ?濡ろ뜏?????ш끽維????癲ル슔?됭짆?륂렭?????????嶺뚮Ĳ?됮????낆뒩??뗫빝??' }); return callback?.({ ok: true, contactMasked: filtered.detected }); }); });
cron.schedule('* * * * *', async () => { for (const chat of store.chats.values()) if (chat.status === 'active' && Date.parse(chat.expiresAt) <= Date.now()) { chat.status = 'read_only'; chat.messages = []; if (redisClient) await redisClient.del(`chat:${chat.matchId}:messages`); io.to(`chat:${chat.matchId}`).emit('chat:expired'); } });
cron.schedule('0 9 * * *', () => { for (const checkin of store.checkins.values()) if (checkin.status === 'scheduled' && Date.parse(checkin.dueAt) <= Date.now()) { checkin.status = 'sent'; checkin.sentAt = new Date().toISOString(); store.notifications.push({ type: 'CHECKIN_DUE', channel: 'push_webhook_mock', action: 'send_feedback_request', checkpoint: checkin.checkpoint, contractId: checkin.contractId, createdAt: checkin.sentAt }); } });
app.use(async (error, req, res, next) => { const duplicateMatch = error?.code === 'P2002' && req.method === 'POST' && req.path === '/api/v1/matches' && databaseEnabled() && req.auth?.sub && req.body?.candidateId; if (!duplicateMatch) console.error('request_failed', error); if (duplicateMatch) { const existing = await getPrisma().match.findFirst({ where: { OR: [{ tenantAId: req.auth.sub, tenantBId: req.body.candidateId }, { tenantAId: req.body.candidateId, tenantBId: req.auth.sub }], deletedAt: null }, select: { id: true, tenantAId: true, tenantBId: true, status: true, compatibilityScore: true, scoreBreakdown: true } }).catch(() => null); if (existing) return res.status(200).json({ match: { id: existing.id, memberIds: [existing.tenantAId, existing.tenantBId], status: existing.status.toLowerCase(), compatibility: existing.compatibilityScore, breakdown: existing.scoreBreakdown }, reused: true }); } return globalErrorHandler(error, req, res, next); });
const checkinScheduler = startCheckinScheduler();
if (databaseEnabled()) setInterval(async () => { const sessions = await getPrisma().chatSession.findMany({ where: { status: 'ACTIVE', expiresAt: { gt: new Date() }, deletedAt: null } }).catch(() => []); for (const session of sessions) if (!store.chats.has(session.matchId)) store.chats.set(session.matchId, { id: session.id, matchId: session.matchId, expiresAt: session.expiresAt.toISOString(), status: 'active', messages: [] }); }, 1000);
process.once('SIGTERM', () => checkinScheduler?.stop());
process.once('SIGINT', () => checkinScheduler?.stop());
server.listen(PORT, () => console.log(`CheckMate API listening on http://localhost:${PORT} (${databaseEnabled() ? 'database' : 'mock'})`));







