import Harvest, { HARVEST_QUALITIES, roundQuantity } from '../models/Harvest.js';
import CropCycle from '../models/CropCycle.js';
import { pick } from '../utils/pick.js';
import { handleError, isValidDate } from '../utils/errors.js';
import { buildListFilter } from '../utils/filters.js';
import { toNumber } from '../utils/numbers.js';

const UPDATABLE_FIELDS = ['quantity', 'unit', 'quality', 'date', 'notes'];
const CYCLE_CLOSED = 'Crop cycle is closed, harvests cannot be changed';

// Sums quantity / sold / remaining per unit, e.g. { QTL: { quantity: 35, sold: 20, remaining: 15 } }
function totalsByUnit(harvests) {
  return harvests.reduce((acc, harvest) => {
    const totals = acc[harvest.unit] || { quantity: 0, sold: 0, remaining: 0 };
    totals.quantity = roundQuantity(totals.quantity + harvest.quantity);
    totals.sold = roundQuantity(totals.sold + harvest.soldQuantity);
    totals.remaining = roundQuantity(totals.remaining + harvest.remainingQuantity);
    acc[harvest.unit] = totals;
    return acc;
  }, {});
}

function validateHarvestInput({ quantity, quality, date }, { partial }) {
  if (!partial || quantity !== undefined) {
    if (!(toNumber(quantity) > 0)) {
      return 'quantity must be a number greater than 0';
    }
  }
  if (!partial || date !== undefined) {
    if (!isValidDate(date)) {
      return 'Invalid date';
    }
  }
  if (quality !== undefined && quality !== null && !HARVEST_QUALITIES.includes(quality)) {
    return `quality must be one of ${HARVEST_QUALITIES.join(', ')}`;
  }
  return null;
}

// POST /api/cycles/:cycleId/harvests
// completesCycle (default true) marks an ACTIVE cycle as HARVESTED, freeing the field.
// Send completesCycle: false for crops picked several times (vegetables, cotton, ...).
export async function createHarvest(req, res) {
  try {
    const { cycleId } = req.params;
    const { quantity, unit, quality, date, notes, completesCycle } = req.body;

    const invalid = validateHarvestInput({ quantity, quality, date }, { partial: false });
    if (invalid) {
      return res.status(400).json({ message: invalid });
    }

    const cycle = await CropCycle.findOne({ _id: cycleId, userId: req.user._id });
    if (!cycle) {
      return res.status(404).json({ message: 'Crop cycle not found' });
    }
    if (cycle.status === 'PLANNED') {
      return res.status(409).json({ message: 'Start the crop cycle before recording a harvest' });
    }
    if (cycle.status === 'CLOSED') {
      return res.status(409).json({ message: CYCLE_CLOSED });
    }

    const harvest = await Harvest.create({
      userId: req.user._id,
      farmId: cycle.farmId,
      fieldId: cycle.fieldId,
      cycleId: cycle._id,
      cropId: cycle.cropId,
      quantity: toNumber(quantity),
      unit: unit || cycle.yieldUnit,
      quality,
      date,
      notes
    });

    if (completesCycle !== false && cycle.status === 'ACTIVE') {
      cycle.status = 'HARVESTED';
      cycle.endDate = cycle.endDate || harvest.date;
      await cycle.save();
    }

    return res.status(201).json({ harvest, cycle });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getHarvestsByCycle(req, res) {
  try {
    const { cycleId } = req.params;
    const cycle = await CropCycle.exists({ _id: cycleId, userId: req.user._id });
    if (!cycle) {
      return res.status(404).json({ message: 'Crop cycle not found' });
    }

    const harvests = await Harvest.find({ cycleId }).sort({ date: -1 });
    return res.status(200).json({ harvests, totals: totalsByUnit(harvests) });
  } catch (error) {
    return handleError(res, error);
  }
}

// GET /api/harvests?farmId=&fieldId=&cycleId=&cropId=&from=&to=&inStock=true
export async function getHarvests(req, res) {
  try {
    const { filter, error } = buildListFilter(req.query, req.user._id, {
      idKeys: ['farmId', 'fieldId', 'cycleId', 'cropId'],
      dateKey: 'date'
    });
    if (error) {
      return res.status(400).json({ message: error });
    }
    if (req.query.inStock === 'true') {
      filter.$expr = { $gt: ['$quantity', '$soldQuantity'] };
    }

    const harvests = await Harvest.find(filter)
      .populate('cropId', 'name localName')
      .populate('fieldId', 'name')
      .sort({ date: -1 });
    return res.status(200).json({ harvests, totals: totalsByUnit(harvests) });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getHarvestById(req, res) {
  try {
    const { harvestId } = req.params;
    const harvest = await Harvest.findOne({ _id: harvestId, userId: req.user._id })
      .populate('cropId', 'name localName')
      .populate('fieldId', 'name');

    if (!harvest) {
      return res.status(404).json({ message: 'Harvest not found' });
    }

    return res.status(200).json({ harvest });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateHarvest(req, res) {
  try {
    const { harvestId } = req.params;
    const harvest = await Harvest.findOne({ _id: harvestId, userId: req.user._id });

    if (!harvest) {
      return res.status(404).json({ message: 'Harvest not found' });
    }

    const cycle = await CropCycle.findById(harvest.cycleId);
    if (cycle?.status === 'CLOSED') {
      return res.status(409).json({ message: CYCLE_CLOSED });
    }

    const updates = pick(req.body, UPDATABLE_FIELDS);
    const invalid = validateHarvestInput(updates, { partial: true });
    if (invalid) {
      return res.status(400).json({ message: invalid });
    }
    if (updates.unit !== undefined && updates.unit !== harvest.unit && harvest.soldQuantity > 0) {
      return res.status(409).json({ message: 'Unit cannot be changed after part of the harvest is sold' });
    }

    // Conditional update so quantity can never drop below what is already sold,
    // even if a sale is recorded at the same moment.
    const filter = { _id: harvest._id };
    if (updates.quantity !== undefined) {
      updates.quantity = toNumber(updates.quantity);
      filter.soldQuantity = { $lte: roundQuantity(updates.quantity) };
    }

    const updated = await Harvest.findOneAndUpdate(filter, { $set: updates }, {
      returnDocument: 'after',
      runValidators: true
    });
    if (!updated) {
      return res.status(409).json({
        message: `Quantity cannot be less than the ${harvest.soldQuantity} ${harvest.unit} already sold`
      });
    }

    return res.status(200).json({ harvest: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function deleteHarvest(req, res) {
  try {
    const { harvestId } = req.params;
    const harvest = await Harvest.findOne({ _id: harvestId, userId: req.user._id });

    if (!harvest) {
      return res.status(404).json({ message: 'Harvest not found' });
    }

    const cycle = await CropCycle.findById(harvest.cycleId);
    if (cycle?.status === 'CLOSED') {
      return res.status(409).json({ message: CYCLE_CLOSED });
    }

    const deleted = await Harvest.findOneAndDelete({ _id: harvest._id, soldQuantity: 0 });
    if (!deleted) {
      return res.status(409).json({ message: 'Harvest has sales recorded, delete those sales first' });
    }

    return res.status(200).json({ message: 'Harvest deleted successfully' });
  } catch (error) {
    return handleError(res, error);
  }
}
