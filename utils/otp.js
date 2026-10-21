import crypto from 'crypto';

// Email verification codes: 6 digits, valid for 10 minutes, 5 wrong tries per code,
// a new code at most once a minute.
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_MS = 60 * 1000;

const SECRET = process.env.JWT_SECRET || 'please_change_this_secret';

function hashCode(key, code) {
  return crypto.createHmac('sha256', SECRET).update(`${key}:${code}`).digest('hex');
}

// Returns the plain code (to email) and what to store with it
export function createOtp(key, now = new Date()) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  return {
    code,
    otp: { hash: hashCode(key, code), expiresAt: new Date(now.getTime() + OTP_TTL_MS), attempts: 0, sentAt: now }
  };
}

export function otpMatches(otp, key, code) {
  if (!otp?.hash || !/^\d{6}$/.test(String(code))) return false;
  const expected = Buffer.from(otp.hash, 'hex');
  const actual = Buffer.from(hashCode(key, String(code)), 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// Seconds until a new code may be sent (0 when it can be sent now)
export function resendWait(otp, now = new Date()) {
  if (!otp?.sentAt) return 0;
  return Math.max(0, Math.ceil((otp.sentAt.getTime() + OTP_RESEND_MS - now.getTime()) / 1000));
}
