import crypto from 'crypto';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

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

function addSession(user, refreshToken) {
  user.refreshTokens = [...user.refreshTokens, { token: refreshToken, createdAt: new Date() }].slice(-MAX_SESSIONS);
}

export async function register(req, res) {
  try {
    const { name, email, password } = req.body;
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
      status: 'enabled'
    });

    const accessToken = createAccessToken(user);
    const refreshToken = createRefreshToken(user);

    addSession(user, refreshToken);
    await user.save();

    return res.status(201).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        status: user.status,
        createdOn: user.createdOn,
        updatedOn: user.updatedOn
      },
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
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        status: user.status,
        createdOn: user.createdOn,
        updatedOn: user.updatedOn
      },
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
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        status: user.status,
        createdOn: user.createdOn,
        updatedOn: user.updatedOn
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
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
