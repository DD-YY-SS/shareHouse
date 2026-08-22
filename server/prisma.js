import { PrismaClient } from '@prisma/client';

let prisma;

export function databaseEnabled() {
  return process.env.MOCK_MODE === 'false' && Boolean(process.env.DATABASE_URL);
}

export function getPrisma() {
  if (!databaseEnabled()) return null;
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

export async function disconnectPrisma() {
  if (prisma) await prisma.$disconnect();
}
