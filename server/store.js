import { randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { DEFAULT_RULES } from './matching.js';

export const store = { users: new Map(), profiles: new Map(), profileCompletedAt: new Map(), preferences: new Map(), consents: new Map(), verifications: new Map(), funnelEvents: [], matches: new Map(), chats: new Map(), chatMetrics: new Map(), presence: new Map(), payments: new Map(), contracts: new Map(), checkins: new Map(), agreements: new Map(), tickets: new Map(), feedback: new Map(), patternAggregates: new Map(), rules: DEFAULT_RULES.map((rule) => ({ ...rule })), notifications: [], liveDemo: { matchRevealed: false, chatEnabled: false, bestCoupleRevealed: false, revealedAt: null, chatEnabledAt: null, bestCouple: null } };
const now = () => new Date().toISOString();
const tenantOne = { id: '00000000-0000-4000-8000-000000000001', accountId: 'tenant1', pseudonym: '세입자 1', age: 28, gender: 'female', role: 'tenant', createdAt: now() };
const tenantTwo = { id: '00000000-0000-4000-8000-000000000002', accountId: 'tenant2', pseudonym: '세입자 2', age: 31, gender: 'female', role: 'tenant', createdAt: now() };
const operator = { id: '00000000-0000-4000-8000-000000000010', accountId: 'operatorA', pseudonym: '오브리빙 운영자', role: 'operator', operatorId: 'operator-a', createdAt: now() };
[tenantOne, tenantTwo, operator].forEach((user) => store.users.set(user.id, user));
const defaultProfile = { lateReturnBand: 1, sleepTimeBand: 1, wakeTimeBand: 1, deliveryWasteBand: 1, cleaningBand: 1, noiseBand: 1, guestFrequencyBand: 1, cookingBand: 1, commonSpaceBand: 1 };
store.profiles.set(tenantOne.id, { ...defaultProfile });
store.profiles.set(tenantTwo.id, { ...defaultProfile, guestFrequencyBand: 2, cookingBand: 2 });

// Named tenant1-tenant30 accounts are also available in MOCK_MODE so the live
// presentation can be tested without a database connection.
const namedTestTenants = [];
for (let index = 3; index <= 30; index += 1) {
  const suffix = String(index).padStart(12, '0');
  const user = { id: `00000000-0000-4000-8000-${suffix}`, accountId: `tenant${index}`, pseudonym: `테스트 세입자 ${index}`, age: 22 + ((index * 3) % 13), gender: 'female', role: 'tenant', createdAt: now() };
  const profile = { ...defaultProfile, lateReturnBand: index % 4, sleepTimeBand: (index + 1) % 4, wakeTimeBand: (index + 2) % 4, roomType: index % 3 === 0 ? 'shared_room' : 'private_room', shareCount: index % 3 === 0 ? 2 : 1, preferredGender: 'any', ageBand: 'any', _meta: { variant: 'standard' } };
  store.users.set(user.id, user);
  store.profiles.set(user.id, profile);
  store.profileCompletedAt.set(user.id, now());
  namedTestTenants.push(user);
}

// Development seed: create a large pool of completed survey profiles without exposing IDs in the UI.
// The data is regenerated when the mock server restarts and is never written to PostgreSQL.
const configuredMockCount = Number.parseInt(process.env.MOCK_TENANT_COUNT || '300', 10);
const mockTenantCount = Number.isInteger(configuredMockCount) ? Math.min(Math.max(configuredMockCount, 0), 1000) : 300;
const mockTenants = [];
const profileKeys = Object.keys(defaultProfile);
const genderOptions = ['female', 'male', 'non_binary', 'prefer_not_to_say'];
for (let index = 1; index <= mockTenantCount; index += 1) {
  const suffix = String(index).padStart(3, '0');
  const user = { id: randomUUID(), accountId: `mock_tenant_${suffix}`, pseudonym: `테스트 입주자 ${suffix}`, age: 20 + ((index * 7) % 16), gender: genderOptions[index % genderOptions.length], role: 'tenant', createdAt: now() };
  const profile = Object.fromEntries(profileKeys.map((key, keyIndex) => [key, (index * 17 + keyIndex * 7) % 4]));
  store.users.set(user.id, user);
  store.profiles.set(user.id, profile);
  mockTenants.push(user);
}

const mockSalt = 'checkmate-dev-mock-tenants';
const mockPasswordHash = scryptSync('1234', mockSalt, 64);
const accounts = [tenantOne, tenantTwo, operator, ...namedTestTenants, ...mockTenants].map((user) => {
  if (user.accountId.startsWith('mock_tenant_')) return { user, salt: mockSalt, passwordHash: mockPasswordHash };
  return { user, salt: `checkmate-dev-${user.accountId}`, passwordHash: scryptSync('1234', `checkmate-dev-${user.accountId}`, 64) };
});
export function authenticateDevelopmentAccount(accountId, password) { const account = accounts.find((item) => item.user.accountId === accountId); if (!account || typeof password !== 'string') return null; const candidate = scryptSync(password, account.salt, 64); return timingSafeEqual(candidate, account.passwordHash) ? account.user : null; }
export function registerDevelopmentAccount({ accountId, password, pseudonym, age, gender }) { if (accounts.some((item) => item.user.accountId.toLowerCase() === accountId.toLowerCase())) return null; const user = { id: randomUUID(), accountId, pseudonym, age, gender, role: 'tenant', createdAt: now() }; store.users.set(user.id, user); accounts.push({ user, salt: `checkmate-dev-${accountId}`, passwordHash: scryptSync(password, `checkmate-dev-${accountId}`, 64) }); return user; }
export const createId = () => randomUUID();
