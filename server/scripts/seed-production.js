import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../auth.js';

const prisma = new PrismaClient();
const password = process.env.SEED_PASSWORD;
if (!password || password.length < 4) throw new Error('Set SEED_PASSWORD (at least 4 characters) before seeding.');

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
  for (const [loginId, pseudonym] of [['tenant1', 'Tenant One'], ['tenant2', 'Tenant Two']]) {
    const tenant = await prisma.tenant.upsert({ where: { loginId }, update: { pseudonym, deletedAt: null }, create: { loginId, pseudonym } });
    await prisma.account.upsert({
      where: { loginId },
      update: { passwordHash: hashPassword(password), tenantId: tenant.id, role: 'TENANT', deletedAt: null, disabledAt: null },
      create: { loginId, passwordHash: hashPassword(password), role: 'TENANT', tenantId: tenant.id },
    });
  }
  await prisma.room.upsert({ where: { operatorId_externalRoomId: { operatorId: operator.id, externalRoomId: '101' } }, update: { deletedAt: null }, create: { operatorId: operator.id, externalRoomId: '101', name: 'Demo House 101' } });
  console.log('Production seed complete. Accounts: operator1, tenant1, tenant2');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
