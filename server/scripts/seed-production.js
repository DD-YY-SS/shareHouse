import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: true });
dotenv.config();
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../auth.js';

const prisma = new PrismaClient();
const password = process.env.SEED_PASSWORD;
if (!password || password.length < 4) throw new Error('Set SEED_PASSWORD (at least 4 characters) before seeding.');

const testProfile = (index) => ({
  lateReturnBand: index % 4,
  sleepTimeBand: (index + 1) % 4,
  wakeTimeBand: (index + 2) % 4,
  deliveryWasteBand: index % 3,
  cleaningBand: (index + 2) % 4,
  noiseBand: (index + 1) % 4,
  guestFrequencyBand: index % 3,
  cookingBand: (index + 3) % 4,
  commonSpaceBand: index % 4,
  roomType: index % 3 === 0 ? 'shared_room' : 'private_room',
  shareCount: index % 3 === 0 ? 2 : 1,
  preferredGender: 'any',
  ageBand: 'any',
  _meta: { variant: 'standard', campusId: null, latitude: null, longitude: null },
});

async function main() {
  const operator = await prisma.operator.upsert({
    where: { slug: 'demo-operator' },
    update: {},
    create: { name: 'CheckMate Demo Operator', slug: 'demo-operator', contactEmail: 'operator@example.com' },
  });
  await prisma.account.upsert({
    where: { loginId: 'operator1' },
    update: { passwordHash: hashPassword(password), operatorId: operator.id, role: 'OPERATOR', deletedAt: null, disabledAt: null },
    create: { loginId: 'operator1', passwordHash: hashPassword(password), role: 'OPERATOR', operatorId: operator.id },
  });
  for (let index = 1; index <= 30; index += 1) {
    const loginId = `tenant${index}`;
    const pseudonym = index === 1 ? 'Tenant One' : index === 2 ? 'Tenant Two' : `테스트 세입자 ${index}`;
    const tenant = await prisma.tenant.upsert({
      where: { loginId },
      update: { pseudonym, age: 22 + ((index * 3) % 13), gender: 'FEMALE', deletedAt: null },
      create: { loginId, pseudonym, age: 22 + ((index * 3) % 13), gender: 'FEMALE' },
    });
    await prisma.account.upsert({
      where: { loginId },
      update: { passwordHash: hashPassword(password), tenantId: tenant.id, role: 'TENANT', deletedAt: null, disabledAt: null },
      create: { loginId, passwordHash: hashPassword(password), role: 'TENANT', tenantId: tenant.id },
    });
    await prisma.behaviorProfile.upsert({
      where: { tenantId: tenant.id },
      update: { answers: testProfile(index), completedAt: new Date(), deletedAt: null },
      create: { tenantId: tenant.id, answers: testProfile(index), completedAt: new Date() },
    });
  }
  await prisma.room.upsert({ where: { operatorId_externalRoomId: { operatorId: operator.id, externalRoomId: '101' } }, update: { deletedAt: null }, create: { operatorId: operator.id, externalRoomId: '101', name: 'Demo House 101' } });
  console.log('Production seed complete. Accounts: operator1, tenant1-tenant30 (password from SEED_PASSWORD)');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
