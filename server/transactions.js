// PostgreSQL example for atomic match acceptance + payment state transition.
// The caller must pass a pg Pool and a Redis client from the application bootstrap.
import { withDistributedLock } from './concurrency.js';

export async function acceptMatchAndCapturePayment({ pool, redis, matchId, userId, paymentId, providerPaymentKey }) {
  return withDistributedLock(redis, `match:${matchId}`, async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const match = await client.query('SELECT id, status FROM matches WHERE id = $1 FOR UPDATE', [matchId]);
      if (!match.rowCount) throw Object.assign(new Error('MATCH_NOT_FOUND'), { statusCode: 404 });
      if (!['proposed', 'chatting'].includes(match.rows[0].status)) throw Object.assign(new Error('MATCH_ALREADY_FINALIZED'), { statusCode: 409 });
      const payment = await client.query('SELECT id, status, amount_krw FROM payments WHERE id = $1 AND match_id = $2 FOR UPDATE', [paymentId, matchId]);
      if (!payment.rowCount) throw Object.assign(new Error('PAYMENT_NOT_FOUND'), { statusCode: 404 });
      if (payment.rows[0].status === 'paid') { await client.query('COMMIT'); return { idempotent: true, matchId, paymentId, status: 'accepted' }; }
      if (payment.rows[0].status !== 'ready') throw Object.assign(new Error('PAYMENT_NOT_CHARGEABLE'), { statusCode: 409 });
      // Verify providerPaymentKey with the PG webhook/provider SDK before this transaction.
      await client.query('UPDATE payments SET status = \'paid\', provider_payment_key_hash = encode(digest($1, \'sha256\'), \'hex\'), paid_at = now() WHERE id = $2', [providerPaymentKey, paymentId]);
      await client.query('UPDATE matches SET status = \'accepted\', accepted_at = now() WHERE id = $1', [matchId]);
      await client.query('INSERT INTO post_care_checkins(match_id, due_at) VALUES ($1, now() + interval \'30 days\') ON CONFLICT (match_id) DO NOTHING', [matchId]);
      await client.query('COMMIT');
      return { idempotent: false, matchId, paymentId, status: 'accepted' };
    } catch (error) { await client.query('ROLLBACK'); if (error.code === '40001') error.statusCode = 409; throw error; }
    finally { client.release(); }
  });
}
