import jwt from 'jsonwebtoken';
import User from '../models/User.js';

import { JWT_SECRET } from '../utils/secrets.js';

const ACTIVITY_WRITE_MS = 10 * 60 * 1000;

// Records when the user was last seen and on which client, at most every 10 minutes
function touchActivity(user, client) {
  const stale = !user.lastActiveAt || Date.now() - user.lastActiveAt.getTime() > ACTIVITY_WRITE_MS;
  if (!stale && (!client || client.platform === user.lastPlatform)) return;
  User.updateOne(
    { _id: user._id },
    { lastActiveAt: new Date(), ...(client && { lastPlatform: client.platform, lastAppVersion: client.appVersion }) }
  ).catch((error) => console.error('Could not record activity', error));
}

export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    if (user.status !== 'enabled') {
      // 401 so the frontend ends the session instead of treating it as "not found"
      return res.status(401).json({ message: 'User is disabled' });
    }

    req.user = user;
    touchActivity(user, req.client);
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}
