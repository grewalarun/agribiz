import crypto from 'crypto';
import { JWT_SECRET } from './secrets.js';

// Public base URL of this API, used in links inside emails
const BASE_URL = () => (process.env.API_PUBLIC_URL || 'https://agribiz-nine.vercel.app').replace(/\/$/, '');

const sign = (userId) => crypto.createHmac('sha256', JWT_SECRET).update(`unsubscribe:${userId}`).digest('hex');

export function unsubscribeUrl(userId) {
  return `${BASE_URL()}/api/email/unsubscribe?u=${userId}&t=${sign(String(userId))}`;
}

export function isValidUnsubscribe(userId, token) {
  const expected = Buffer.from(sign(String(userId)));
  const given = Buffer.from(String(token ?? ''));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
