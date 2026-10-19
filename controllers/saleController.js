import Sale from '../models/Sale.js';
import Harvest, { roundQuantity } from '../models/Harvest.js';
import CropCycle from '../models/CropCycle.js';
import { pick } from '../utils/pick.js';
import { handleError, isValidDate } from '../utils/errors.js';
import { buildListFilter, escapeRegex } from '../utils/filters.js';
import { toNumber } from '../utils/numbers.js';

const UPDATABLE_FIELDS = ['quantity', 'pricePerUnit', 'buyer', 'date', 'notes'];
const CYCLE_CLOSED = 'Crop cycle is closed, sales cannot be changed';

const roundAmount = (value) => Math.round(value * 100) / 100;

function summarize(sales) {
  return sales.reduce(
    (acc, sale) => ({
      totalQuantity: roundQuantity(acc.totalQuantity + sale.quantity),
      totalAmount: roundAmount(acc.totalAmount + sale.totalAmount)
    }),
    { totalQuantity: 0, totalAmount: 0 }
  );
}

function validateSaleInput({ quantity, pricePerUnit, date }, { partial }) {
  if (!partial || quantity !== undefined) {
    if (!(toNumber(quantity) > 0)) {
      return 'quantity must be a number greater than 0';
    }
  }
  if (!partial || pricePerUnit !== undefined) {
    if (!(toNumber(pricePerUnit) >= 0)) {
      return 'pricePerUnit must be a number 0 or more';
    }
  }
  if (!partial || date !== undefined) {
    if (!isValidDate(date)) {
      return 'Invalid date';
    }
  }
  return null;
}

// Adds `amount` (may be negative) to soldQuantity, rounded inside the same update so
// repeated decimal sales don't drift (0.1 + 0.2 stays 0.3).
const addToSold = (amount) => [
  { $set: { soldQuantity: { $round: [{ $add: ['$soldQuantity', amount] }, 3] } } }
];

// Atomically moves `amount` from remaining stock to sold. Returns the updated harvest,
// or null if there isn't enough stock left.
function reserveStock(harvestId, amount) {
  return Harvest.findOneAndUpdate(
    { _id: harvestId, $expr: { $gte: [{ $round: [{ $subtract: ['$quantity', '$soldQuantity'] }, 3] }, amount] } },
    addToSold(amount),
    { returnDocument: 'after', updatePipeline: true }
  );
}

function releaseStock(harvestId, amount) {
  return Harvest.updateOne({ _id: harvestId }, addToSold(-amount), { updatePipeline: true });
}

async function notEnoughStock(res, harvestId) {
  const harvest = await Harvest.findById(harvestId);
  return res.status(409).json({
    message: `Not enough stock, only ${harvest.remainingQuantity} ${harvest.unit} left`,
    remainingQuantity: harvest.remainingQuantity
  });
}

// POST /api/harvests/:harvestId/sales
export async function createSale(req, res) {
  try {
    const { harvestId } = req.params;
    const { quantity, pricePerUnit, buyer, date, notes } = req.body;

    const invalid = validateSaleInput({ quantity, pricePerUnit, date }, { partial: false });
    if (invalid) {
      return res.status(400).json({ message: invalid });
    }

    const harvest = await Harvest.findOne({ _id: harvestId, userId: req.user._id });
    if (!harvest) {
      return res.status(404).json({ message: 'Harvest not found' });
    }

    const cycle = await CropCycle.findById(harvest.cycleId);
    if (cycle?.status === 'CLOSED') {
      return res.status(409).json({ message: CYCLE_CLOSED });
    }

    const saleQuantity = roundQuantity(toNumber(quantity));
    const price = toNumber(pricePerUnit);

    const reserved = await reserveStock(harvest._id, saleQuantity);
    if (!reserved) {
      return notEnoughStock(res, harvest._id);
    }

    try {
      const sale = await Sale.create({
        userId: req.user._id,
        farmId: harvest.farmId,
        fieldId: harvest.fieldId,
        cycleId: harvest.cycleId,
        harvestId: harvest._id,
        cropId: harvest.cropId,
        quantity: saleQuantity,
        unit: harvest.unit,
        pricePerUnit: price,
        totalAmount: roundAmount(saleQuantity * price),
        buyer,
        date,
        notes
      });

      return res.status(201).json({ sale, harvest: reserved });
    } catch (error) {
      await releaseStock(harvest._id, saleQuantity);
      throw error;
    }
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getSalesByHarvest(req, res) {
  try {
    const { harvestId } = req.params;
    const harvest = await Harvest.exists({ _id: harvestId, userId: req.user._id });
    if (!harvest) {
      return res.status(404).json({ message: 'Harvest not found' });
    }

    const sales = await Sale.find({ harvestId }).sort({ date: -1 });
    return res.status(200).json({ sales, ...summarize(sales) });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getSalesByCycle(req, res) {
  try {
    const { cycleId } = req.params;
    const cycle = await CropCycle.exists({ _id: cycleId, userId: req.user._id });
    if (!cycle) {
      return res.status(404).json({ message: 'Crop cycle not found' });
    }

    const sales = await Sale.find({ cycleId }).sort({ date: -1 });
    return res.status(200).json({ sales, ...summarize(sales) });
  } catch (error) {
    return handleError(res, error);
  }
}

// GET /api/sales?farmId=&fieldId=&cycleId=&harvestId=&cropId=&buyer=&from=&to=
export async function getSales(req, res) {
  try {
    const { filter, error } = buildListFilter(req.query, req.user._id, {
      idKeys: ['farmId', 'fieldId', 'cycleId', 'harvestId', 'cropId'],
      dateKey: 'date'
    });
    if (error) {
      return res.status(400).json({ message: error });
    }
    if (req.query.buyer) {
      filter.buyer = { $regex: escapeRegex(String(req.query.buyer)), $options: 'i' };
    }

    const sales = await Sale.find(filter)
      .populate('cropId', 'name localName')
      .populate('fieldId', 'name')
      .sort({ date: -1 });
    return res.status(200).json({ sales, ...summarize(sales) });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getSaleById(req, res) {
  try {
    const { saleId } = req.params;
    const sale = await Sale.findOne({ _id: saleId, userId: req.user._id })
      .populate('cropId', 'name localName')
      .populate('fieldId', 'name');

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    return res.status(200).json({ sale });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateSale(req, res) {
  try {
    const { saleId } = req.params;
    const sale = await Sale.findOne({ _id: saleId, userId: req.user._id });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    const cycle = await CropCycle.findById(sale.cycleId);
    if (cycle?.status === 'CLOSED') {
      return res.status(409).json({ message: CYCLE_CLOSED });
    }

    const updates = pick(req.body, UPDATABLE_FIELDS);
    const invalid = validateSaleInput(updates, { partial: true });
    if (invalid) {
      return res.status(400).json({ message: invalid });
    }
    if (updates.quantity !== undefined) {
      updates.quantity = roundQuantity(toNumber(updates.quantity));
    }
    if (updates.pricePerUnit !== undefined) {
      updates.pricePerUnit = toNumber(updates.pricePerUnit);
    }

    // Adjust harvest stock by the change in quantity
    const delta = updates.quantity !== undefined ? roundQuantity(updates.quantity - sale.quantity) : 0;
    if (delta > 0) {
      const reserved = await reserveStock(sale.harvestId, delta);
      if (!reserved) {
        return notEnoughStock(res, sale.harvestId);
      }
    } else if (delta < 0) {
      await releaseStock(sale.harvestId, -delta);
    }

    try {
      sale.set(updates);
      sale.totalAmount = roundAmount(sale.quantity * sale.pricePerUnit);
      await sale.save();
    } catch (error) {
      // undo the stock adjustment made above
      if (delta !== 0) {
        await releaseStock(sale.harvestId, delta);
      }
      throw error;
    }

    return res.status(200).json({ sale });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function deleteSale(req, res) {
  try {
    const { saleId } = req.params;
    const sale = await Sale.findOne({ _id: saleId, userId: req.user._id });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    const cycle = await CropCycle.findById(sale.cycleId);
    if (cycle?.status === 'CLOSED') {
      return res.status(409).json({ message: CYCLE_CLOSED });
    }

    const deleted = await Sale.findOneAndDelete({ _id: sale._id });
    if (deleted) {
      await releaseStock(sale.harvestId, sale.quantity);
    }

    return res.status(200).json({ message: 'Sale deleted successfully' });
  } catch (error) {
    return handleError(res, error);
  }
}
