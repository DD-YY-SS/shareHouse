import { createId } from './store.js';

// Redis SET NX PX lock. Always release only if the caller owns the lock.
export async function withDistributedLock(redis, key, fn, ttlMs = 5000) {
  if (!redis) return fn();
  const token = createId();
  const acquired = await redis.set(`lock:${key}`, token, { NX: true, PX: ttlMs });
  if (acquired !== 'OK') { const error = new Error('RESOURCE_BUSY'); error.statusCode = 409; throw error; }
  try { return await fn(); }
  finally {
    await redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", { keys: [`lock:${key}`], arguments: [token] });
  }
}
