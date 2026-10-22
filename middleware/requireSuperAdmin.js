import { isSuperAdmin } from '../utils/admin.js';

// Use after authenticate
export function requireSuperAdmin(req, res, next) {
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
}
