import cron from 'node-cron';
import { getPrisma } from '../prisma.js';
import { CheckinRepository } from '../repositories/checkin.repository.js';

const checkpoints = [
  { value: 'DAY_15', days: 15 },
  { value: 'DAY_30', days: 30 },
];

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

async function runCheckinJob() {
  const db = getPrisma();
  if (!db) return;
  const repository = new CheckinRepository();
  const today = startOfToday();

  for (const { value: checkpoint, days } of checkpoints) {
    const dueBefore = new Date(today);
    dueBefore.setDate(dueBefore.getDate() - days);

    const matches = await db.match.findMany({
      where: {
        status: 'CONFIRMED',
        deletedAt: null,
        confirmedAt: { lte: dueBefore },
        careCheckins: { none: { checkpoint, deletedAt: null } },
      },
      select: { id: true, tenantAId: true, tenantBId: true },
    });

    for (const match of matches) {
      try {
        await repository.createPendingCheckins({
          matchId: match.id,
          tenantAId: match.tenantAId,
          tenantBId: match.tenantBId,
          checkpoint,
        });
      } catch (error) {
        console.error('checkin_creation_failed', { matchId: match.id, checkpoint, error: error.message });
      }
    }
  }
}

export function startCheckinScheduler() {
  if (process.env.ENABLE_CRON !== 'true') return null;

  return cron.schedule('0 0 * * *', async () => {
    const db = getPrisma();
    if (!db) return;

    const lock = await db.$queryRaw`SELECT pg_try_advisory_lock(hashtext('checkmate:checkin-scheduler')) AS locked`;
    if (!lock[0]?.locked) return;

    try {
      await runCheckinJob();
    } finally {
      await db.$queryRaw`SELECT pg_advisory_unlock(hashtext('checkmate:checkin-scheduler'))`;
    }
  }, { timezone: 'Asia/Seoul' });
}

export { runCheckinJob };
