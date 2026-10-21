import { createRemoteJWKSet, jwtVerify } from 'jose';

// Checks the ID token ("credential") that the Google sign-in button gives the browser.
// Google's signing keys are fetched and cached by jose. GOOGLE_JWKS_URL is only for tests.
const GOOGLE_KEYS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

export class GoogleAuthError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'GoogleAuthError';
    this.status = status;
  }
}

let keys = null;

// Returns { googleId, email, name } for a valid token; throws GoogleAuthError otherwise
export async function verifyGoogleCredential(credential) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new GoogleAuthError(503, 'Google sign-in is not configured on the server (GOOGLE_CLIENT_ID missing)');
  }
  if (!credential || typeof credential !== 'string') {
    throw new GoogleAuthError(400, 'Missing Google credential');
  }
  keys ??= createRemoteJWKSet(new URL(process.env.GOOGLE_JWKS_URL || GOOGLE_KEYS_URL));

  let payload;
  try {
    ({ payload } = await jwtVerify(credential, keys, { issuer: GOOGLE_ISSUERS, audience: clientId }));
  } catch {
    throw new GoogleAuthError(401, 'Google sign-in failed. Please try again.');
  }
  // Google marks whether it has confirmed the address; only trust confirmed ones
  if (!payload.sub || !payload.email || (payload.email_verified !== true && payload.email_verified !== 'true')) {
    throw new GoogleAuthError(401, 'Your Google account email is not verified');
  }
  const email = String(payload.email).toLowerCase();
  return { googleId: String(payload.sub), email, name: String(payload.name || email.split('@')[0]) };
}
