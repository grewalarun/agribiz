import crypto from 'crypto';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { pick } from '../utils/pick.js';
import { handleError } from '../utils/errors.js';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'please_change_this_secret';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'please_change_refresh_secret';
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
    createdOn: user.createdOn,
    updatedOn: user.updatedOn
  };
}

function addSession(user, refreshToken) {
  user.refreshTokens = [...user.refreshTokens, { token: refreshToken, createdAt: new Date() }].slice(-MAX_SESSIONS);
}

export async function register(req, res) {
  try {
    const { name, email, password, language } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ message: 'Email already in use' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      status: 'enabled',
      ...(['en', 'hi', 'pa'].includes(language) && { language })
    });

    const accessToken = createAccessToken(user);
    const refreshToken = createRefreshToken(user);

    addSession(user, refreshToken);
    await user.save();

    return res.status(201).json({
      user: toPublicUser(user),
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
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

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.status !== 'enabled') {
      return res.status(403).json({ message: 'User is disabled' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const accessToken = createAccessToken(user);
    const refreshToken = createRefreshToken(user);

    addSession(user, refreshToken);
    await user.save();

    return res.status(200).json({
      user: toPublicUser(user),
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function getMe(req, res) {
  try {
    const user = req.user;
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
// body) and signs out every other device
export async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword, refreshToken } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required' });
    }
    if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    // authenticate loads the user without the password hash
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
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
