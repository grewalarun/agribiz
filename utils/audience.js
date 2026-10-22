import mongoose from 'mongoose';
import User from '../models/User.js';
import Farm from '../models/Farm.js';
import CropCycle from '../models/CropCycle.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_PICKED_USERS = 500;

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Checks and cleans an audience from a request body. Returns { audience } or { error }.
export function parseAudience(input) {
  const type = input?.type;
  if (!['all', 'group', 'users'].includes(type)) return { error: 'Choose who should receive this message' };
  if (type === 'all') return { audience: { type } };

  if (type === 'users') {
    const ids = [...new Set((Array.isArray(input.userIds) ? input.userIds : []).map(String))];
    if (ids.length === 0) return { error: 'Pick at least one user' };
    if (ids.length > MAX_PICKED_USERS) return { error: `Pick at most ${MAX_PICKED_USERS} users` };
    if (!ids.every((id) => mongoose.isValidObjectId(id))) return { error: 'Invalid user' };
    return { audience: { type, userIds: ids } };
  }

  const audience = { type };
  if (input.language) {
    if (!['en', 'hi', 'pa'].includes(input.language)) return { error: 'Invalid language' };
    audience.language = input.language;
  }
  if (String(input.state ?? '').trim()) audience.state = String(input.state).trim().slice(0, 80);
  if (input.hasActiveCycle === true) audience.hasActiveCycle = true;
  if (input.signedUpWithinDays !== undefined && input.signedUpWithinDays !== null && input.signedUpWithinDays !== '') {
    const days = Number(input.signedUpWithinDays);
    if (!Number.isInteger(days) || days < 1 || days > 3650) return { error: 'Signed up within must be 1 to 3650 days' };
    audience.signedUpWithinDays = days;
  }
  if (Object.keys(audience).length === 1) return { error: 'Choose at least one filter for the group' };
  return { audience };
}

// The users who should get an announcement email. Disabled users, users who
// unsubscribed and users without an email are never included.
export async function resolveAudience(audience) {
  const filter = { status: 'enabled', emailOptOut: { $ne: true }, email: { $exists: true, $ne: '' } };
  const and = [];

  if (audience.type === 'users') {
    filter._id = { $in: audience.userIds };
  } else if (audience.type === 'group') {
    if (audience.language) filter.language = audience.language;
    if (audience.signedUpWithinDays) filter.createdOn = { $gte: new Date(Date.now() - audience.signedUpWithinDays * DAY_MS) };
    if (audience.state) {
      const ids = await Farm.distinct('userId', {
        'location.state': { $regex: `^${escapeRegex(audience.state)}$`, $options: 'i' }
      });
      and.push({ _id: { $in: ids } });
    }
    if (audience.hasActiveCycle) {
      and.push({ _id: { $in: await CropCycle.distinct('userId', { status: 'ACTIVE' }) } });
    }
  }
  if (and.length) filter.$and = and;

  return User.find(filter).select('name email language').lean();
}
