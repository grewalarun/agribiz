import Expense, { EXPENSE_CATEGORIES } from '../models/Expense.js';
import CropCycle from '../models/CropCycle.js';
import { pick } from '../utils/pick.js';
import { handleError, isValidDate } from '../utils/errors.js';
import { buildListFilter } from '../utils/filters.js';

const UPDATABLE_FIELDS = ['category', 'description', 'amount', 'date'];
const CYCLE_CLOSED = 'Crop cycle is closed, expenses cannot be changed';

function normalizeCategory(category) {
  return typeof category === 'string' ? category.trim().toUpperCase() : category;
}

export async function createExpense(req, res) {
  try {
    const { cycleId } = req.params;
    const { description, amount, date } = req.body;
    const category = normalizeCategory(req.body.category);

    if (!category || amount === undefined || !date) {
      return res.status(400).json({ message: 'category, amount and date are required' });
    }
    if (!EXPENSE_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: `category must be one of ${EXPENSE_CATEGORIES.join(', ')}` });
    }
    if (!isValidDate(date)) {
      return res.status(400).json({ message: 'Invalid date' });
    }

    const cycle = await CropCycle.findOne({ _id: cycleId, userId: req.user._id });
    if (!cycle) {
      return res.status(404).json({ message: 'Crop cycle not found' });
    }
    if (cycle.status === 'CLOSED') {
      return res.status(409).json({ message: CYCLE_CLOSED });
    }

    const expense = await Expense.create({
      userId: req.user._id,
      farmId: cycle.farmId,
      fieldId: cycle.fieldId,
      cycleId: cycle._id,
      category,
      description,
      amount,
      date
    });

    return res.status(201).json({ expense });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getExpensesByCycle(req, res) {
  try {
    const { cycleId } = req.params;
    const cycle = await CropCycle.exists({ _id: cycleId, userId: req.user._id });
    if (!cycle) {
      return res.status(404).json({ message: 'Crop cycle not found' });
    }

    const expenses = await Expense.find({ cycleId }).sort({ date: -1 });
    const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);

    return res.status(200).json({ expenses, total });
  } catch (error) {
    return handleError(res, error);
  }
}

// GET /api/expenses?farmId=&fieldId=&cycleId=&category=&from=&to=
export async function getExpenses(req, res) {
  try {
    const { filter, error } = buildListFilter(req.query, req.user._id, {
      idKeys: ['farmId', 'fieldId', 'cycleId'],
      dateKey: 'date'
    });
    if (error) {
      return res.status(400).json({ message: error });
    }
    if (req.query.category) {
      filter.category = normalizeCategory(String(req.query.category));
    }

    const expenses = await Expense.find(filter)
      .populate('fieldId', 'name')
      .sort({ date: -1 });
    const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);

    return res.status(200).json({ expenses, total });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getExpenseById(req, res) {
  try {
    const { expenseId } = req.params;
    const expense = await Expense.findOne({ _id: expenseId, userId: req.user._id });

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    return res.status(200).json({ expense });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateExpense(req, res) {
  try {
    const { expenseId } = req.params;
    const expense = await Expense.findOne({ _id: expenseId, userId: req.user._id });

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    const cycle = await CropCycle.findById(expense.cycleId);
    if (cycle?.status === 'CLOSED') {
      return res.status(409).json({ message: CYCLE_CLOSED });
    }

    const updates = pick(req.body, UPDATABLE_FIELDS);
    if (updates.category !== undefined) {
      updates.category = normalizeCategory(updates.category);
    }
    if (updates.date !== undefined && !isValidDate(updates.date)) {
      return res.status(400).json({ message: 'Invalid date' });
    }

    expense.set(updates);
    await expense.save();

    return res.status(200).json({ expense });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function deleteExpense(req, res) {
  try {
    const { expenseId } = req.params;
    const expense = await Expense.findOne({ _id: expenseId, userId: req.user._id });

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    const cycle = await CropCycle.findById(expense.cycleId);
    if (cycle?.status === 'CLOSED') {
      return res.status(409).json({ message: CYCLE_CLOSED });
    }

    await expense.deleteOne();
    return res.status(200).json({ message: 'Expense deleted successfully' });
  } catch (error) {
    return handleError(res, error);
  }
}
