import { getPrisma } from '../prisma.js';

const include = { match: { select: { id: true, room: { select: { id: true, externalRoomId: true, name: true } } } } };

export class CheckinRepository {
  async createPendingCheckins({ matchId, tenantAId, tenantBId, checkpoint }) {
    const db = getPrisma();
    const match = await db.match.findFirst({ where: { id: matchId, tenantAId, tenantBId, status: 'CONFIRMED', deletedAt: null }, select: { id: true } });
    if (!match) throw Object.assign(new Error('MATCH_NOT_CONFIRMABLE'), { statusCode: 409 });
    return db.careCheckin.createMany({
      data: [
        { matchId, tenantId: tenantAId, checkpoint, sentAt: new Date() },
        { matchId, tenantId: tenantBId, checkpoint, sentAt: new Date() },
      ],
      skipDuplicates: true,
    });
  }

  async submitAnswer({ checkinId, tenantId, satisfaction, conflict, label }) {
    const result = await getPrisma().careCheckin.updateMany({
      where: { id: checkinId, tenantId, respondedAt: null, deletedAt: null },
      data: { satisfaction, conflict, label, respondedAt: new Date() },
    });
    if (result.count !== 1) throw Object.assign(new Error('CHECKIN_NOT_FOUND_OR_ALREADY_RESPONDED'), { statusCode: 404 });
    return getPrisma().careCheckin.findFirst({ where: { id: checkinId, tenantId }, include });
  }

  async getPendingForTenant(tenantId) {
    return getPrisma().careCheckin.findMany({ where: { tenantId, respondedAt: null, deletedAt: null }, include, orderBy: { createdAt: 'asc' } });
  }
}
