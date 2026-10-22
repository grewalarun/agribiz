import dotenv from 'dotenv';

dotenv.config();

const DEV_JWT_SECRET = 'please_change_this_secret';
const DEV_REFRESH_SECRET = 'please_change_refresh_secret';

// The fallbacks keep local development working; production must set real secrets
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || !process.env.REFRESH_TOKEN_SECRET)) {
  throw new Error('JWT_SECRET and REFRESH_TOKEN_SECRET must be set in production');
}

export const JWT_SECRET = process.env.JWT_SECRET || DEV_JWT_SECRET;
export const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || DEV_REFRESH_SECRET;
