import CropCycle from '../models/CropCycle.js';
import Expense from '../models/Expense.js';
import Harvest, { roundQuantity } from '../models/Harvest.js';
import Sale from '../models/Sale.js';
import { findOwnedField } from '../utils/ownership.js';
import { buildListFilter } from '../utils/filters.js';
import { handleError } from '../utils/errors.js';
import { SEASON_TYPES, getSeasonLabel } from '../utils/season.js';

const roundAmount = (value) => Math.round(value * 100) / 100;

// Newest season first; Rabi/Annual years ("2026-27") sort by their starting year
const SEASON_ORDER = { RABI: 0, ANNUAL: 1, ZAID: 2, KHARIF: 3 };
function compareSeasons(a, b) {
  const yearDiff = Number(b.seasonYear.slice(0, 4)) - Number(a.seasonYear.slice(0, 4));
  return yearDiff || SEASON_ORDER[a.seasonType] - SEASON_ORDER[b.seasonType];
}

function findCycles(filter) {
  return CropCycle.find(filter)
    .populate('cropId', 'name localName')
    .populate('fieldId', 'name area areaUnit')
    .sort({ startDate: 1 });
}

// Totals expenses, harvests and sales per cycle in three aggregation queries.
async function loadFinancials(userId, cycles) {
  const match = { userId, cycleId: { $in: cycles.map((cycle) => cycle._id) } };

  const [expenses, harvests, sales] = await Promise.all([
    Expense.aggregate([
      { $match: match },
      { $group: { _id: { cycleId: '$cycleId', category: '$category' }, amount: { $sum: '$amount' } } }
    ]),
    Harvest.aggregate([
      { $match: match },
      {
        $group: {
          _id: { cycleId: '$cycleId', unit: '$unit' },
          quantity: { $sum: '$quantity' },
          sold: { $sum: '$soldQuantity' }
        }
      }
    ]),
    Sale.aggregate([
      { $match: match },
      { $group: { _id: '$cycleId', revenue: { $sum: '$totalAmount' }, quantity: { $sum: '$quantity' } } }
    ])
  ]);

  const byCycle = new Map(
    cycles.map((cycle) => [String(cycle._id), { expensesByCategory: {}, harvested: {}, revenue: 0, soldQuantity: 0 }])
  );

  for (const row of expenses) {
    byCycle.get(String(row._id.cycleId)).expensesByCategory[row._id.category] = roundAmount(row.amount);
  }
  for (const row of harvests) {
    byCycle.get(String(row._id.cycleId)).harvested[row._id.unit] = {
      quantity: roundQuantity(row.quantity),
      sold: roundQuantity(row.sold),
      remaining: roundQuantity(row.quantity - row.sold)
    };
  }
  for (const row of sales) {
    const financials = byCycle.get(String(row._id));
    financials.revenue = roundAmount(row.revenue);
    financials.soldQuantity = roundQuantity(row.quantity);
  }

  return byCycle;
}

function perArea(value, area, round) {
  return area > 0 ? round(value / area) : null;
}

// One report row per crop cycle: costs, revenue, profit, yield and unsold stock.
function buildCycleRow(cycle, financials) {
  const field = cycle.fieldId;
  const crop = cycle.cropId;
  const area = field?.area ?? null;

  const expenses = roundAmount(Object.values(financials.expensesByCategory).reduce((sum, amount) => sum + amount, 0));
  const profit = roundAmount(financials.revenue - expenses);
  const actualYield = financials.harvested[cycle.yieldUnit]?.quantity ?? 0;

  return {
    cycleId: cycle._id,
    crop: crop ? { _id: crop._id, name: crop.name, localName: crop.localName } : null,
    field: field ? { _id: field._id, name: field.name, area: field.area, areaUnit: field.areaUnit } : null,
    seasonType: cycle.seasonType,
    seasonYear: cycle.seasonYear,
    season: cycle.season,
    status: cycle.status,
    startDate: cycle.startDate,
    endDate: cycle.endDate,
    expenses,
    expensesByCategory: financials.expensesByCategory,
    revenue: financials.revenue,
    profit,
    profitPerArea: perArea(profit, area, roundAmount),
    expectedYield: cycle.expectedYield ?? null,
    actualYield,
    yieldUnit: cycle.yieldUnit,
    yieldPerArea: perArea(actualYield, area, roundQuantity),
    harvested: financials.harvested,
    soldQuantity: financials.soldQuantity,
    averageSalePrice: financials.soldQuantity > 0 ? roundAmount(financials.revenue / financials.soldQuantity) : null
  };
}

async function buildCycleRows(userId, cycles) {
  const financials = await loadFinancials(userId, cycles);
  return cycles.map((cycle) => buildCycleRow(cycle, financials.get(String(cycle._id))));
}

// Adds up cycle rows. Each field's area counts once even if it grew several crops,
// and area is only summed when every field uses the same unit.
function sumRows(rows) {
  const totals = rows.reduce(
    (acc, row) => {
      acc.expenses += row.expenses;
      acc.revenue += row.revenue;
      for (const [category, amount] of Object.entries(row.expensesByCategory)) {
        acc.expensesByCategory[category] = roundAmount((acc.expensesByCategory[category] || 0) + amount);
      }
      if (row.field && !acc.fieldIds.has(String(row.field._id))) {
        acc.fieldIds.add(String(row.field._id));
        acc.areaUnits.add(row.field.areaUnit);
        acc.area += row.field.area;
      }
      return acc;
    },
    { expenses: 0, revenue: 0, expensesByCategory: {}, area: 0, areaUnits: new Set(), fieldIds: new Set() }
  );

  const sameUnit = totals.areaUnits.size === 1;
  const area = sameUnit ? roundQuantity(totals.area) : null;
  const expenses = roundAmount(totals.expenses);
  const revenue = roundAmount(totals.revenue);
  const profit = roundAmount(revenue - expenses);

  return {
    cycles: rows.length,
    area,
    areaUnit: sameUnit ? [...totals.areaUnits][0] : null,
    expenses,
    expensesByCategory: totals.expensesByCategory,
    revenue,
    profit,
    profitPerArea: perArea(profit, area, roundAmount)
  };
}

// GET /api/reports/cycles/:cycleId
export async function getCycleReport(req, res) {
  try {
    const cycles = await findCycles({ _id: req.params.cycleId, userId: req.user._id });
    if (!cycles.length) {
      return res.status(404).json({ message: 'Crop cycle not found' });
    }

    const [report] = await buildCycleRows(req.user._id, cycles);
    return res.status(200).json({ report });
  } catch (error) {
    return handleError(res, error);
  }
}

// GET /api/reports/fields/:fieldId — every crop grown on the field, oldest first
export async function getFieldReport(req, res) {
  try {
    const field = await findOwnedField(req.params.fieldId, req.user._id);
    if (!field) {
      return res.status(404).json({ message: 'Field not found' });
    }

    const cycles = await findCycles({ fieldId: field._id, userId: req.user._id });
    const rows = await buildCycleRows(req.user._id, cycles);

    return res.status(200).json({
      field: { _id: field._id, name: field.name, area: field.area, areaUnit: field.areaUnit },
      totals: sumRows(rows),
      cycles: rows
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// GET /api/reports/seasons?farmId= — one summary line per season, newest first
export async function getSeasonsReport(req, res) {
  try {
    const { filter, error } = buildListFilter(req.query, req.user._id, { idKeys: ['farmId', 'fieldId'] });
    if (error) {
      return res.status(400).json({ message: error });
    }

    const cycles = await findCycles(filter);
    const rows = await buildCycleRows(req.user._id, cycles);

    const groups = new Map();
    for (const row of rows) {
      const key = `${row.seasonType}|${row.seasonYear}`;
      if (!groups.has(key)) {
        groups.set(key, { seasonType: row.seasonType, seasonYear: row.seasonYear, rows: [] });
      }
      groups.get(key).rows.push(row);
    }

    const seasons = [...groups.values()]
      .map(({ seasonType, seasonYear, rows: seasonRows }) => ({
        seasonType,
        seasonYear,
        season: getSeasonLabel(seasonType, seasonYear),
        ...sumRows(seasonRows)
      }))
      .sort(compareSeasons);

    return res.status(200).json({ seasons, totals: sumRows(rows) });
  } catch (error) {
    return handleError(res, error);
  }
}

// GET /api/reports/seasons/:seasonType/:seasonYear?farmId= — season detail by crop and by cycle
export async function getSeasonReport(req, res) {
  try {
    const seasonType = String(req.params.seasonType).toUpperCase();
    const { seasonYear } = req.params;

    if (!SEASON_TYPES.includes(seasonType)) {
      return res.status(400).json({ message: `seasonType must be one of ${SEASON_TYPES.join(', ')}` });
    }

    const { filter, error } = buildListFilter(req.query, req.user._id, { idKeys: ['farmId', 'fieldId'] });
    if (error) {
      return res.status(400).json({ message: error });
    }

    const cycles = await findCycles({ ...filter, seasonType, seasonYear });
    const rows = await buildCycleRows(req.user._id, cycles);

    const cropGroups = new Map();
    for (const row of rows) {
      const key = String(row.crop?._id);
      if (!cropGroups.has(key)) {
        cropGroups.set(key, { crop: row.crop, rows: [] });
      }
      cropGroups.get(key).rows.push(row);
    }
    const byCrop = [...cropGroups.values()]
      .map(({ crop, rows: cropRows }) => ({ crop, ...sumRows(cropRows) }))
      .sort((a, b) => b.profit - a.profit);

    return res.status(200).json({
      seasonType,
      seasonYear,
      season: getSeasonLabel(seasonType, seasonYear),
      totals: sumRows(rows),
      byCrop,
      cycles: rows
    });
  } catch (error) {
    return handleError(res, error);
  }
}
