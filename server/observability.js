import crypto from 'node:crypto';
import morgan from 'morgan';

export const requestId = (req, res, next) => {
  req.id = req.get('x-request-id') || crypto.randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
};

export const httpLogger = morgan(':method :url :status :response-time ms request_id=:req[x-request-id]');

export function reportCritical(error, context = {}) {
  // Replace with Sentry.captureException(error) and a Slack webhook in production.
  console.error(JSON.stringify({ level: 'critical', error: error?.message, stack: error?.stack, ...context }));
}
