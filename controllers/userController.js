import crypto from 'crypto';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User.js';
import PendingSignup from '../models/PendingSignup.js';
import { pick } from '../utils/pick.js';
import { handleError } from '../utils/errors.js';
import { EmailError, isEmailConfigured, sendEmail } from '../utils/email.js';
import { otpEmailTemplate } from '../utils/emailTemplates.js';
import { OTP_MAX_ATTEMPTS, OTP_RESEND_MS, createOtp, otpMatches, resendWait } from '../utils/otp.js';
import { GoogleAuthError, verifyGoogleCredential } from '../utils/google.js';
import { JWT_SECRET, REFRESH_TOKEN_SECRET } from '../utils/secrets.js';
import { isAllowlistedAdmin, isSuperAdmin } from '../utils/admin.js';

dotenv.config();

// Logged-in devices per user; logging in on a new one drops the oldest
const MAX_SESSIONS = 5;

function createAccessToken(user) {
  return jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '15m' });
}

// jwtid makes every session's token unique, even for logins in the same second
function createRefreshToken(user) {
  return jwt.sign({ id: user._id, email: user.email }, REFRESH_TOKEN_SECRET, {
    expiresIn: '30d',
    jwtid: crypto.randomUUID()
  });
}

// The user fields returned by the API (never the password or tokens)
function toPublicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    language: user.language,
    status: user.status,
    role: isSuperAdmin(user) ? 'superadmin' : 'user',
    emailOptOut: Boolean(user.emailOptOut),
    hasPassword: Boolean(user.password),
    hasGoogle: Boolean(user.googleId),
    createdOn: user.createdOn,
    updatedOn: user.updatedOn
  };
}

function addSession(user, refreshToken) {
  user.refreshTokens = [...user.refreshTokens, { token: refreshToken, createdAt: new Date() }].slice(-MAX_SESSIONS);
}

const LANGUAGES = ['en', 'hi', 'pa'];
// New signups allowed per email address per hour (each one sends an email)
const MAX_SIGNUPS_PER_HOUR = 5;

// Logs the user in: a new session plus the response shape shared by every login route
async function issueSession(res, user, status = 200, extra = {}) {
  // Emails in SUPER_ADMIN_EMAILS become super admins when they log in
  if (user.role !== 'superadmin' && isAllowlistedAdmin(user.email)) {
    user.role = 'superadmin';
  }
  const accessToken = createAccessToken(user);
  const refreshToken = createRefreshToken(user);
  addSession(user, refreshToken);
  await user.save();
  return res.status(status).json({ user: toPublicUser(user), accessToken, refreshToken, ...extra });
}

// Emails the code. Without RESEND_API_KEY outside production, the code is printed
// to the server console instead so signup can be tried locally.
async function deliverCode(pending, code) {
  if (!isEmailConfigured() && process.env.NODE_ENV !== 'production') {
    console.log(`[dev] Verification code for ${pending.email}: ${code}`);
    return;
  }
  await sendEmail({ to: pending.email, ...otpEmailTemplate({ code, name: pending.name, language: pending.language }) });
}

// Sends a new code for this signup unless one went out in the last minute.
// Returns the seconds until another code may be sent.
async function sendCode(pending) {
  const now = new Date();
  const { code, otp } = createOtp(String(pending._id), now);
  // Claim the send atomically so two quick requests can't both send
  const previous = await PendingSignup.findOneAndUpdate(
    {
      _id: pending._id,
      $or: [{ 'otp.sentAt': { $exists: false } }, { 'otp.sentAt': null }, { 'otp.sentAt': { $lte: new Date(now.getTime() - OTP_RESEND_MS) } }]
    },
    { $set: { otp } },
    { returnDocument: 'before' }
  );
  if (!previous) {
    const current = await PendingSignup.findById(pending._id).select('otp');
    return resendWait(current?.otp, now);
  }
  try {
    await deliverCode(pending, code);
  } catch (error) {
    // Keep the earlier code (and the user's minute) when the email couldn't be sent
    await PendingSignup.updateOne({ _id: pending._id, 'otp.hash': otp.hash }, { $set: { otp: previous.toObject().otp ?? {} } });
    throw error;
  }
  return OTP_RESEND_MS / 1000;
}

function verificationResponse(pending, retryAfter) {
  return { verificationRequired: true, verificationId: pending._id, email: pending.email, retryAfter };
}

function emailErrorResponse(res, error) {
  if (error instanceof EmailError) {
    return res.status(error.status).json({ message: `Could not send the verification email. ${error.message}` });
  }
  return null;
}

// POST /api/auth/register — no account yet: emails a code, and the account is
// created by verify-email
export async function register(req, res) {
  try {
    const { name, email, password, language } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    const normalizedEmail = String(email).trim().toLowerCase();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ message: 'Email already in use' });
    }

    const recent = await PendingSignup.countDocuments({
      email: normalizedEmail,
      createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) }
    });
    if (recent >= MAX_SIGNUPS_PER_HOUR) {
      return res.status(429).json({ message: 'Too many signups for this email. Please try again in an hour.' });
    }

    const pending = await PendingSignup.create({
      name: String(name).trim(),
      email: normalizedEmail,
      password: await bcrypt.hash(String(password), 10),
      ...(LANGUAGES.includes(language) && { language })
    });

    try {
      const retryAfter = await sendCode(pending);
      return res.status(201).json(verificationResponse(pending, retryAfter));
    } catch (error) {
      await PendingSignup.deleteOne({ _id: pending._id });
      throw error;
    }
  } catch (error) {
    return emailErrorResponse(res, error) ?? handleError(res, error);
  }
}

export async function signup(req, res) {
  return register(req, res);
}

export async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    const normalizedEmail = String(email).trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      // Signed up but never entered the code: send a new one and ask for it
      const pendings = await PendingSignup.find({ email: normalizedEmail }).sort({ createdAt: -1 }).limit(MAX_SIGNUPS_PER_HOUR);
      for (const pending of pendings) {
        if (await bcrypt.compare(String(password), pending.password)) {
          const retryAfter = await sendCode(pending);
          return res.status(403).json({ message: 'Please verify your email', ...verificationResponse(pending, retryAfter) });
        }
      }
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.status !== 'enabled') {
      return res.status(403).json({ message: 'User is disabled' });
    }

    if (!user.password) {
      return res.status(400).json({ message: 'This account uses Google sign-in. Use "Continue with Google".', code: 'GOOGLE_ACCOUNT' });
    }

    const isMatch = await bcrypt.compare(String(password), user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    return issueSession(res, user);
  } catch (error) {
    return emailErrorResponse(res, error) ?? handleError(res, error);
  }
}

// Looks up the signup a verify/resend request is for
async function findPending(verificationId) {
  if (!mongoose.isValidObjectId(verificationId)) return null;
  return PendingSignup.findById(verificationId);
}

const SIGNUP_EXPIRED = { message: 'This signup has expired. Please sign up again.', code: 'SIGNUP_EXPIRED' };

// POST /api/auth/verify-email { verificationId, code } — creates the account and logs in
export async function verifyEmail(req, res) {
  try {
    const { verificationId, code } = req.body;
    const pending = await findPending(verificationId);
    if (!pending) {
      return res.status(400).json(SIGNUP_EXPIRED);
    }

    // Use up one try before comparing, so parallel guesses can't exceed the limit
    const now = new Date();
    const claimed = await PendingSignup.findOneAndUpdate(
      { _id: pending._id, 'otp.hash': { $exists: true }, 'otp.expiresAt': { $gt: now }, 'otp.attempts': { $lt: OTP_MAX_ATTEMPTS } },
      { $inc: { 'otp.attempts': 1 } },
      { returnDocument: 'after' }
    );
    if (!claimed) {
      if (pending.otp?.expiresAt && pending.otp.expiresAt > now) {
        return res.status(400).json({ message: 'Too many incorrect tries. Please request a new code.', code: 'TOO_MANY_ATTEMPTS' });
      }
      return res.status(400).json({ message: 'This code has expired. Please request a new code.', code: 'CODE_EXPIRED' });
    }

    if (!otpMatches(claimed.otp, String(claimed._id), String(code ?? '').trim())) {
      const attemptsLeft = OTP_MAX_ATTEMPTS - claimed.otp.attempts;
      return res.status(400).json(
        attemptsLeft > 0
          ? { message: `Incorrect code. ${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left.`, code: 'WRONG_CODE', attemptsLeft }
          : { message: 'Too many incorrect tries. Please request a new code.', code: 'TOO_MANY_ATTEMPTS' }
      );
    }

    // The email is confirmed: this signup becomes the account, other pending ones go
    await PendingSignup.deleteMany({ email: claimed.email });
    if (await User.exists({ email: claimed.email })) {
      return res.status(409).json({ message: 'This email is already registered. Please sign in.' });
    }

    let user;
    try {
      user = await User.create({
        name: claimed.name,
        email: claimed.email,
        password: claimed.password,
        language: claimed.language,
        status: 'enabled'
      });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({ message: 'This email is already registered. Please sign in.' });
      }
      throw error;
    }
    return issueSession(res, user, 201);
  } catch (error) {
    return handleError(res, error);
  }
}

// POST /api/auth/resend-code { verificationId } — at most once a minute
export async function resendCode(req, res) {
  try {
    const pending = await findPending(req.body.verificationId);
    if (!pending) {
      return res.status(400).json(SIGNUP_EXPIRED);
    }
    const waitBefore = resendWait(pending.otp);
    if (waitBefore > 0) {
      res.set('Retry-After', String(waitBefore));
      return res.status(429).json({ message: `Please wait ${waitBefore} seconds before asking for a new code`, retryAfter: waitBefore });
    }
    const retryAfter = await sendCode(pending);
    return res.status(200).json({ message: 'A new code has been sent', retryAfter });
  } catch (error) {
    return emailErrorResponse(res, error) ?? handleError(res, error);
  }
}

// POST /api/auth/google { credential, language? } — signs in with the Google button.
// An account with the same email is linked; otherwise a new one is created.
export async function googleSignIn(req, res) {
  try {
    const { googleId, email, name } = await verifyGoogleCredential(req.body.credential);

    let user = await User.findOne({ googleId });
    let isNew = false;
    if (!user) {
      user = await User.findOne({ email });
      if (user) {
        if (user.googleId && user.googleId !== googleId) {
          return res.status(409).json({ message: 'This email is linked to a different Google account' });
        }
        user.googleId = googleId;
      } else {
        try {
          user = await User.create({
            name,
            email,
            googleId,
            status: 'enabled',
            ...(LANGUAGES.includes(req.body.language) && { language: req.body.language })
          });
        } catch (error) {
          // Two sign-ins at once: the other one created the account
          if (error?.code !== 11000) throw error;
          user = await User.findOne({ googleId });
          if (!user) throw error;
        }
        isNew = true;
      }
      // Google has confirmed this address, so unfinished signups for it are dropped
      await PendingSignup.deleteMany({ email });
    }

    if (user.status !== 'enabled') {
      return res.status(403).json({ message: 'User is disabled' });
    }

    return issueSession(res, user, isNew ? 201 : 200, { isNew });
  } catch (error) {
    if (error instanceof GoogleAuthError) {
      return res.status(error.status).json({ message: error.message });
    }
    return handleError(res, error);
  }
}

export async function getMe(req, res) {
  try {
    // authenticate loads the user without the password, which hasPassword needs
    const user = await User.findById(req.user?._id);
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    return res.status(200).json({
      user: toPublicUser(user)
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
}

const MIN_PASSWORD_LENGTH = 6;
// Indian mobile number: optional +91 / 0 prefix, then 10 digits starting 6-9
const PHONE_PATTERN = /^(?:\+?91|0)?([6-9]\d{9})$/;

// PATCH /api/auth/me — name, phone and language; email is the login id and stays fixed
export async function updateMe(req, res) {
  try {
    const updates = pick(req.body, ['name', 'phone', 'language']);

    if (updates.name !== undefined) {
      const name = String(updates.name).trim();
      if (!name) {
        return res.status(400).json({ message: 'Name cannot be empty' });
      }
      updates.name = name;
    }

    if (updates.phone !== undefined) {
      const raw = String(updates.phone ?? '').replace(/[\s-]/g, '');
      if (raw === '') {
        updates.phone = undefined;
      } else {
        const match = raw.match(PHONE_PATTERN);
        if (!match) {
          return res.status(400).json({ message: 'Enter a valid 10-digit mobile number' });
        }
        updates.phone = match[1];
      }
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    user.set(updates);
    await user.save();

    return res.status(200).json({ user: toPublicUser(user) });
  } catch (error) {
    return handleError(res, error);
  }
}

// POST /api/auth/change-password — keeps the caller's session (refreshToken in the
// body) and signs out every other device. Accounts that only use Google have no
// password yet: they set one without a current password.
export async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword, refreshToken } = req.body;

    if (!newPassword) {
      return res.status(400).json({ message: 'New password is required' });
    }
    if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    // authenticate loads the user without the password hash
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    if (!user.password) {
      user.password = await bcrypt.hash(String(newPassword), 10);
      await user.save();
      return res.status(200).json({ message: 'Password set. You can now also sign in with your email and password.' });
    }

    if (!currentPassword) {
      return res.status(400).json({ message: 'Current and new password are required' });
    }
    const isMatch = await bcrypt.compare(String(currentPassword), user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }
    if (await bcrypt.compare(String(newPassword), user.password)) {
      return res.status(400).json({ message: 'New password must be different from the current one' });
    }

    user.password = await bcrypt.hash(String(newPassword), 10);
    user.refreshTokens = user.refreshTokens.filter((item) => refreshToken && item.token === refreshToken);
    await user.save();

    return res.status(200).json({ message: 'Password changed. Other devices have been signed out.' });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function refreshToken(req, res) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ message: 'Missing refresh token' });
    }

    const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(403).json({ message: 'Invalid refresh token' });
    }

    const tokenExists = user.refreshTokens.some((item) => item.token === refreshToken);
    if (!tokenExists) {
      return res.status(403).json({ message: 'Invalid refresh token' });
    }

    // The refresh token is not rotated: the frontend may refresh from several
    // requests at once, and rotating would make all but the first one fail.
    const newAccessToken = createAccessToken(user);

    return res.status(200).json({ accessToken: newAccessToken, refreshToken });
  } catch (error) {
    return res.status(403).json({ message: 'Invalid or expired refresh token' });
  }
}

export async function logout(req, res) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ message: 'Missing refresh token' });
    }

    const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(200).json({ message: 'Logged out' });
    }

    // Only end this device's session
    user.refreshTokens = user.refreshTokens.filter((item) => item.token !== refreshToken);
    await user.save();

    return res.status(200).json({ message: 'Logged out' });
  } catch (error) {
    return res.status(200).json({ message: 'Logged out' });
  }
}
