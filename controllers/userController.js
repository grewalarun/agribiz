import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'please_change_this_secret';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'please_change_refresh_secret';

function createAccessToken(user) {
  return jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '15m' });
}

function createRefreshToken(user) {
  return jwt.sign({ id: user._id, email: user.email }, REFRESH_TOKEN_SECRET, { expiresIn: '30d' });
}

export async function signup(req, res) {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Missing required fields' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ message: 'Email already in use' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed });

    const accessToken = createAccessToken(user);
    const refreshToken = createRefreshToken(user);

    user.refreshTokens.push({ token: refreshToken });
    await user.save();

    return res.status(201).json({ user: { id: user._id, name: user.name, email: user.email, status: user.status, createdOn: user.createdOn }, accessToken, refreshToken });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Missing required fields' });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    if (user.status !== 'enabled') return res.status(403).json({ message: 'User is disabled' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    const accessToken = createAccessToken(user);
    const refreshToken = createRefreshToken(user);

    user.refreshTokens.push({ token: refreshToken });
    await user.save();

    return res.json({ user: { id: user._id, name: user.name, email: user.email, status: user.status, updatedOn: user.updatedOn }, accessToken, refreshToken });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function refreshToken(req, res) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ message: 'Missing refresh token' });

    // find user with this refresh token
    const user = await User.findOne({ 'refreshTokens.token': refreshToken });
    if (!user) return res.status(403).json({ message: 'Invalid refresh token' });

    try {
      jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
    } catch (err) {
      // invalid token - remove it from DB
      user.refreshTokens = user.refreshTokens.filter((r) => r.token !== refreshToken);
      await user.save();
      return res.status(403).json({ message: 'Invalid refresh token' });
    }

    // rotate refresh token for better security
    user.refreshTokens = user.refreshTokens.filter((r) => r.token !== refreshToken);
    const newRefreshToken = createRefreshToken(user);
    user.refreshTokens.push({ token: newRefreshToken });
    await user.save();

    const newAccessToken = createAccessToken(user);
    return res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function logout(req, res) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ message: 'Missing refresh token' });

    const user = await User.findOne({ 'refreshTokens.token': refreshToken });
    if (!user) return res.status(200).json({ message: 'Logged out' });

    user.refreshTokens = user.refreshTokens.filter((r) => r.token !== refreshToken);
    await user.save();
    return res.status(200).json({ message: 'Logged out' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
}
