import mongoose from 'mongoose';
import User from '../models/User.js';
import Farm from '../models/Farm.js';
import Field from '../models/Field.js';
import Crop from '../models/Crop.js';
import CropCycle from '../models/CropCycle.js';
import Expense from '../models/Expense.js';
import Harvest from '../models/Harvest.js';
import Sale from '../models/Sale.js';
import { handleError } from '../utils/errors.js';
import { isSuperAdmin } from '../utils/admin.js';
import { PLATFORMS } from '../middleware/clientInfo.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 366;
// Day buckets follow Indian time so "today" matches what the owner sees
const TIMEZONE = 'Asia/Kolkata';

const round = (value) => Math.round((value ?? 0) * 100) / 100;

// ?from&to (ISO dates), default the last 30 days, capped at a year. `to` is inclusive.
function parseRange(query) {
  const to = query.to ? new Date(query.to) : new Date();
  if (Number.isNaN(to.getTime())) return null;
  if (query.to && /^\d{4}-\d{2}-\d{2}$/.test(String(query.to))) to.setUTCHours(23, 59, 59, 999);
  let from = query.from ? new Date(query.from) : new Date(to.getTime() - (DEFAULT_RANGE_DAYS - 1) * DAY_MS);
  if (Number.isNaN(from.getTime()) || from > to) return null;
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) from = new Date(to.getTime() - MAX_RANGE_DAYS * DAY_MS);
  return { from, to };
}

function badRange(res) {
  return res.status(400).json({ message: 'Invalid date range' });
}

const platformOf = (query) => (PLATFORMS.includes(query.platform) ? query.platform : undefined);

// "yyyy-mm-dd" for every day in the range, so charts have no gaps
function listDays(from, to) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE });
  const days = [];
  for (let t = from.getTime(); t <= to.getTime() + DAY_MS - 1; t += DAY_MS) {
    const day = fmt.format(new Date(t));
    if (days[days.length - 1] !== day) days.push(day);
  }
  return days;
}

const dayOf = (field) => ({ $dateToString: { format: '%Y-%m-%d', date: field, timezone: TIMEZONE } });

// Turns [{_id: day, ...}] rows into one value per day (0 where nothing happened)
function fillDays(days, rows, pickValue) {
  const byDay = new Map(rows.map((row) => [row._id, row]));
  return days.map((day) => ({ date: day, ...pickValue(byDay.get(day)) }));
}

const countBy = (field) => [{ $group: { _id: field, count: { $sum: 1 } } }, { $sort: { count: -1 } }];

async function activeUserIds(from, to) {
  const match = { createdAt: { $gte: from, $lte: to } };
  const lists = await Promise.all([Expense, Harvest, Sale].map((model) => model.distinct('userId', match)));
  return new Set(lists.flat().map(String));
}

// GET /api/admin/overview
export async function getOverview(req, res) {
  try {
    const range = parseRange(req.query);
    if (!range) return badRange(res);
    const { from, to } = range;
    const platform = platformOf(req.query);
    const userFilter = platform ? { lastPlatform: platform } : {};
    const inRange = { $gte: from, $lte: to };

    const [users, newUsers, disabled, farms, fields, cropsCount, cyclesByStatus, area, expenses, harvests, sales, activeIds] =
      await Promise.all([
        User.countDocuments(userFilter),
        User.countDocuments({ ...userFilter, createdOn: inRange }),
        User.countDocuments({ ...userFilter, status: 'disabled' }),
        Farm.countDocuments(),
        Field.countDocuments(),
        Crop.countDocuments(),
        CropCycle.aggregate(countBy('$status')),
        Farm.aggregate([{ $group: { _id: '$areaUnit', area: { $sum: '$totalArea' } } }]),
        Expense.aggregate([{ $match: { date: inRange } }, { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } }]),
        Harvest.aggregate([{ $match: { date: inRange } }, { $group: { _id: '$unit', quantity: { $sum: '$quantity' }, count: { $sum: 1 } } }]),
        Sale.aggregate([{ $match: { date: inRange } }, { $group: { _id: null, revenue: { $sum: '$totalAmount' }, count: { $sum: 1 } } }]),
        activeUserIds(from, to)
      ]);

    let activeUsers = activeIds.size;
    if (platform) {
      activeUsers = await User.countDocuments({ ...userFilter, _id: { $in: [...activeIds] } });
    }

    return res.status(200).json({
      range: { from, to },
      users: { total: users, new: newUsers, active: activeUsers, disabled },
      farms,
      fields,
      crops: cropsCount,
      cyclesByStatus: Object.fromEntries(cyclesByStatus.map((row) => [row._id, row.count])),
      area: area.map((row) => ({ unit: row._id, area: round(row.area) })),
      expenses: { amount: round(expenses[0]?.amount), count: expenses[0]?.count ?? 0 },
      harvests: harvests.map((row) => ({ unit: row._id, quantity: round(row.quantity), count: row.count })),
      sales: { revenue: round(sales[0]?.revenue), count: sales[0]?.count ?? 0 }
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// GET /api/admin/signups — new users per day, split by sign-in method
export async function getSignups(req, res) {
  try {
    const range = parseRange(req.query);
    if (!range) return badRange(res);
    const { from, to } = range;
    const platform = platformOf(req.query);

    const rows = await User.aggregate([
      { $match: { createdOn: { $gte: from, $lte: to }, ...(platform && { lastPlatform: platform }) } },
      {
        $group: {
          _id: dayOf('$createdOn'),
          total: { $sum: 1 },
          google: { $sum: { $cond: [{ $ifNull: ['$googleId', false] }, 1, 0] } }
        }
      }
    ]);

    const days = fillDays(listDays(from, to), rows, (row) => ({
      total: row?.total ?? 0,
      google: row?.google ?? 0,
      password: (row?.total ?? 0) - (row?.google ?? 0)
    }));
    return res.status(200).json({ range: { from, to }, days });
  } catch (error) {
    return handleError(res, error);
  }
}

// GET /api/admin/activity — records added per day
export async function getActivity(req, res) {
  try {
    const range = parseRange(req.query);
    if (!range) return badRange(res);
    const { from, to } = range;
    const match = { $match: { createdAt: { $gte: from, $lte: to } } };
    const group = { $group: { _id: dayOf('$createdAt'), count: { $sum: 1 } } };

    const [expenses, harvests, sales] = await Promise.all(
      [Expense, Harvest, Sale].map((model) => model.aggregate([match, group]))
    );
    const days = listDays(from, to);
    const series = (rows) => new Map(rows.map((row) => [row._id, row.count]));
    const e = series(expenses);
    const h = series(harvests);
    const s = series(sales);

    return res.status(200).json({
      range: { from, to },
      days: days.map((date) => ({ date, expenses: e.get(date) ?? 0, harvests: h.get(date) ?? 0, sales: s.get(date) ?? 0 }))
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// GET /api/admin/breakdowns — top crops, seasons, languages and places
export async function getBreakdowns(req, res) {
  try {
    const [crops, seasons, languages, states, districts] = await Promise.all([
      CropCycle.aggregate([
        { $group: { _id: '$cropId', count: { $sum: 1 } } },
        { $lookup: { from: 'crops', localField: '_id', foreignField: '_id', as: 'crop' } },
        // crops are per user, so merge same-named crops from different users
        { $group: { _id: { $toLower: { $ifNull: [{ $arrayElemAt: ['$crop.name', 0] }, 'unknown'] } }, count: { $sum: '$count' } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),
      CropCycle.aggregate(countBy('$seasonType')),
      User.aggregate(countBy('$language')),
      Farm.aggregate([{ $match: { 'location.state': { $nin: [null, ''] } } }, ...countBy({ $toLower: '$location.state' }), { $limit: 10 }]),
      Farm.aggregate([{ $match: { 'location.district': { $nin: [null, ''] } } }, ...countBy({ $toLower: '$location.district' }), { $limit: 10 }])
    ]);

    const toRows = (rows) => rows.map((row) => ({ label: row._id ?? 'unknown', count: row.count }));
    return res.status(200).json({
      crops: toRows(crops),
      seasons: toRows(seasons),
      languages: toRows(languages),
      states: toRows(states),
      districts: toRows(districts)
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// GET /api/admin/platforms — who uses which client (the mobile numbers stay 0 until the app ships)
export async function getPlatforms(req, res) {
  try {
    const [byPlatform, versions] = await Promise.all([
      User.aggregate(countBy({ $ifNull: ['$lastPlatform', 'unknown'] })),
      User.aggregate([
        { $match: { lastPlatform: { $in: ['android', 'ios'] }, lastAppVersion: { $ne: null } } },
        { $group: { _id: { platform: '$lastPlatform', version: '$lastAppVersion' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 }
      ])
    ]);
    const counts = Object.fromEntries(byPlatform.map((row) => [row._id, row.count]));
    return res.status(200).json({
      users: { web: counts.web ?? 0, android: counts.android ?? 0, ios: counts.ios ?? 0, unknown: counts.unknown ?? 0 },
      appVersions: versions.map((row) => ({ platform: row._id.platform, version: row._id.version, count: row.count }))
    });
  } catch (error) {
    return handleError(res, error);
  }
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /api/admin/users?search&status&page&limit
export async function listUsers(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const filter = {};
    if (['enabled', 'disabled'].includes(req.query.status)) filter.status = req.query.status;
    if (PLATFORMS.includes(req.query.platform)) filter.lastPlatform = req.query.platform;
    const search = String(req.query.search ?? '').trim().slice(0, 100);
    if (search) {
      const pattern = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ name: pattern }, { email: pattern }, { phone: pattern }];
    }

    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select('name email phone language status role lastActiveAt lastPlatform emailOptOut googleId password createdOn')
        .sort({ createdOn: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
    ]);

    const ids = users.map((user) => user._id);
    const [farms, ...lastRecords] = await Promise.all([
      Farm.aggregate([{ $match: { userId: { $in: ids } } }, { $group: { _id: '$userId', count: { $sum: 1 } } }]),
      ...[Expense, Harvest, Sale].map((model) =>
        model.aggregate([{ $match: { userId: { $in: ids } } }, { $group: { _id: '$userId', last: { $max: '$createdAt' } } }])
      )
    ]);
    const farmCount = new Map(farms.map((row) => [String(row._id), row.count]));
    const lastRecord = new Map();
    for (const row of lastRecords.flat()) {
      const key = String(row._id);
      if (!lastRecord.has(key) || row.last > lastRecord.get(key)) lastRecord.set(key, row.last);
    }

    return res.status(200).json({
      page,
      limit,
      total,
      users: users.map((user) => ({
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        language: user.language,
        status: user.status,
        isAdmin: isSuperAdmin(user),
        emailOptOut: Boolean(user.emailOptOut),
        signIn: [user.password && 'password', user.googleId && 'google'].filter(Boolean),
        platform: user.lastPlatform,
        farms: farmCount.get(String(user._id)) ?? 0,
        lastActiveAt: user.lastActiveAt,
        lastRecordAt: lastRecord.get(String(user._id)),
        createdOn: user.createdOn
      }))
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// PATCH /api/admin/users/:userId/status { status } — disabling also ends the user's sessions
export async function setUserStatus(req, res) {
  try {
    const { status } = req.body;
    if (!['enabled', 'disabled'].includes(status)) {
      return res.status(400).json({ message: 'status must be enabled or disabled' });
    }
    if (!mongoose.isValidObjectId(req.params.userId)) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (String(user._id) === String(req.user._id) || isSuperAdmin(user)) {
      return res.status(400).json({ message: 'Admins cannot be disabled' });
    }

    user.status = status;
    if (status === 'disabled') user.refreshTokens = [];
    await user.save();
    return res.status(200).json({ id: user._id, status: user.status });
  } catch (error) {
    return handleError(res, error);
  }
}
