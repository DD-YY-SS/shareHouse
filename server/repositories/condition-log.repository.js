import { getPrisma } from '../prisma.js';

const publicTenant = { id: true, pseudonym: true };
const include = {
  reporter: { select: publicTenant },
  room: { select: { id: true, externalRoomId: true, name: true } },
};

export class ConditionLogRepository {
  async create({ roomId, reporterId, type, description, imageUrl }) {
    const db = getPrisma();
    const scope = await db.match.findFirst({
      where: { roomId, status: 'CONFIRMED', deletedAt: null, OR: [{ tenantAId: reporterId }, { tenantBId: reporterId }] },
      select: { id: true },
    });
    if (!scope) throw Object.assign(new Error('ROOM_CONDITION_SCOPE_REQUIRED'), { statusCode: 403 });
    return db.roomConditionLog.create({
      data: { roomId, reporterId, type, description: description?.trim() || null, imageUrl, capturedAt: new Date() },
      include,
    });
  }

  async listForRoom({ roomId, tenantId, operatorId }) {
    const db = getPrisma();
    if (tenantId) {
      const scope = await db.match.findFirst({ where: { roomId, status: 'CONFIRMED', deletedAt: null, OR: [{ tenantAId: tenantId }, { tenantBId: tenantId }] }, select: { id: true } });
      if (!scope) throw Object.assign(new Error('ROOM_CONDITION_SCOPE_REQUIRED'), { statusCode: 403 });
    }
    if (operatorId) {
      const scope = await db.room.findFirst({ where: { id: roomId, operatorId, deletedAt: null }, select: { id: true } });
      if (!scope) throw Object.assign(new Error('OPERATOR_ROOM_SCOPE_REQUIRED'), { statusCode: 403 });
    }
    return db.roomConditionLog.findMany({ where: { roomId, deletedAt: null }, include, orderBy: { capturedAt: 'desc' } });
  }

  async softDelete({ id, reporterId }) {
    const result = await getPrisma().roomConditionLog.updateMany({ where: { id, reporterId, deletedAt: null }, data: { deletedAt: new Date() } });
    if (result.count !== 1) throw Object.assign(new Error('CONDITION_LOG_NOT_FOUND'), { statusCode: 404 });
  }
}
