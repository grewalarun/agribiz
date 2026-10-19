import mongoose from 'mongoose';
import CropCycle from '../models/CropCycle.js';
import Crop from '../models/Crop.js';
import Expense from '../models/Expense.js';
import Harvest from '../models/Harvest.js';
import Sale from '../models/Sale.js';
import { findOwnedField } from '../utils/ownership.js';
import { pick } from '../utils/pick.js';
import { buildListFilter } from '../utils/filters.js';
import { handleError, isValidDate } from '../utils/errors.js';
import { SEASON_TYPES, getSeasonYear } from '../utils/season.js';

const UPDATABLE_FIELDS = ['cropId', 'seasonType', 'startDate', 'endDate', 'status', 'expectedYield', 'yieldUnit', 'notes'];
const ACTIVE_CONFLICT = 'This field already has an active crop cycle';

async function hasOtherActiveCycle(fieldId, excludeCycleId) {
  const filter = { fieldId, status: 'ACTIVE' };
  if (excludeCycleId) {
    filter._id = { $ne: excludeCycleId };
  }
  return CropCycle.exists(filter);
}

export async function createCycle(req, res) {
  try {
    const { fieldId } = req.params;
    const { cropId, seasonType, startDate, endDate, status, expectedYield, yieldUnit, notes } = req.body;

    if (!cropId || !seasonType || !startDate) {
      return res.status(400).json({ message: 'cropId, seasonType and startDate are required' });
    }
    if (!SEASON_TYPES.includes(seasonType)) {
      return res.status(400).json({ message: `seasonType must be one of ${SEASON_TYPES.join(', ')}` });
    }
    if (!isValidDate(startDate)) {
      return res.status(400).json({ message: 'Invalid startDate' });
    }
    if (status && !['PLANNED', 'ACTIVE'].includes(status)) {
      return res.status(400).json({ message: 'A new cycle can only be PLANNED or ACTIVE' });
    }
    if (!mongoose.isValidObjectId(cropId)) {
      return res.status(400).json({ message: 'Invalid cropId' });
    }

    const field = await findOwnedField(fieldId, req.user._id);
    if (!field) {
      return res.status(404).json({ message: 'Field not found' });
    }

    const crop = await Crop.findOne({ _id: cropId, userId: req.user._id });
    if (!crop) {
      return res.status(404).json({ message: 'Crop not found' });
    }

    const cycleStatus = status || 'ACTIVE';
    if (cycleStatus === 'ACTIVE' && (await hasOtherActiveCycle(field._id))) {
      return res.status(409).json({ message: ACTIVE_CONFLICT });
    }

    const cycle = await CropCycle.create({
      userId: req.user._id,
      farmId: field.farmId,
      fieldId: field._id,
      cropId: crop._id,
      seasonType,
      seasonYear: getSeasonYear(seasonType, startDate),
      startDate,
      endDate,
      status: cycleStatus,
      expectedYield,
      yieldUnit: yieldUnit || crop.defaultUnit,
      notes
    });

    return res.status(201).json({ cycle });
  } catch (error) {
    return handleError(res, error, ACTIVE_CONFLICT);
  }
}

export async function getCyclesByField(req, res) {
  try {
    const { fieldId } = req.params;
    const field = await findOwnedField(fieldId, req.user._id);
    if (!field) {
      return res.status(404).json({ message: 'Field not found' });
    }

    const cycles = await CropCycle.find({ fieldId })
      .populate('cropId', 'name localName defaultUnit')
      .sort({ startDate: -1 });
    return res.status(200).json({ cycles });
  } catch (error) {
    return handleError(res, error);
  }
}

// GET /api/cycles?farmId=&fieldId=&status=&seasonType=&seasonYear=
export async function getCycles(req, res) {
  try {
    const { filter, error } = buildListFilter(req.query, req.user._id, {
      idKeys: ['farmId', 'fieldId'],
      stringKeys: ['status', 'seasonType', 'seasonYear']
    });
    if (error) {
      return res.status(400).json({ message: error });
    }

    const cycles = await CropCycle.find(filter)
      .populate('cropId', 'name localName defaultUnit')
      .populate('fieldId', 'name area areaUnit')
      .sort({ startDate: -1 });
    return res.status(200).json({ cycles });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getCycleById(req, res) {
  try {
    const { cycleId } = req.params;
    const cycle = await CropCycle.findOne({ _id: cycleId, userId: req.user._id })
      .populate('cropId', 'name localName defaultUnit')
      .populate('fieldId', 'name area areaUnit soilType irrigationType');

    if (!cycle) {
      return res.status(404).json({ message: 'Crop cycle not found' });
    }

    return res.status(200).json({ cycle });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateCycle(req, res) {
  try {
    const { cycleId } = req.params;
    const cycle = await CropCycle.findOne({ _id: cycleId, userId: req.user._id });

    if (!cycle) {
      return res.status(404).json({ message: 'Crop cycle not found' });
    }

    const updates = pick(req.body, UPDATABLE_FIELDS);

    if (updates.cropId && String(updates.cropId) !== String(cycle.cropId)) {
      if (await Harvest.exists({ cycleId: cycle._id })) {
        return res.status(409).json({ message: 'Crop cannot be changed after a harvest is recorded' });
      }
      if (!mongoose.isValidObjectId(updates.cropId)) {
        return res.status(400).json({ message: 'Invalid cropId' });
      }
      const crop = await Crop.exists({ _id: updates.cropId, userId: req.user._id });
      if (!crop) {
        return res.status(404).json({ message: 'Crop not found' });
      }
    }
    if (updates.startDate !== undefined && !isValidDate(updates.startDate)) {
      return res.status(400).json({ message: 'Invalid startDate' });
    }
    if (updates.status === 'ACTIVE' && (await hasOtherActiveCycle(cycle.fieldId, cycle._id))) {
      return res.status(409).json({ message: ACTIVE_CONFLICT });
    }

    cycle.set(updates);
    cycle.seasonYear = getSeasonYear(cycle.seasonType, cycle.startDate);

    await cycle.save();
    return res.status(200).json({ cycle });
  } catch (error) {
    return handleError(res, error, ACTIVE_CONFLICT);
  }
}

export async function deleteCycle(req, res) {
  try {
    const { cycleId } = req.params;
    const cycle = await CropCycle.findOne({ _id: cycleId, userId: req.user._id });

    if (!cycle) {
      return res.status(404).json({ message: 'Crop cycle not found' });
    }

    await Sale.deleteMany({ cycleId: cycle._id });
    await Harvest.deleteMany({ cycleId: cycle._id });
    await Expense.deleteMany({ cycleId: cycle._id });
    await cycle.deleteOne();

    return res.status(200).json({ message: 'Crop cycle deleted successfully' });
  } catch (error) {
    return handleError(res, error);
  }
}
