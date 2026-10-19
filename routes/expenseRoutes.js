import express from 'express';
import { getExpenses, getExpenseById, updateExpense, deleteExpense } from '../controllers/expenseController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { validateObjectId } from '../middleware/validateObjectId.js';

const router = express.Router();

router.use(authenticate);
router.param('expenseId', validateObjectId);

router.get('/', getExpenses);
router.get('/:expenseId', getExpenseById);
router.patch('/:expenseId', updateExpense);
router.delete('/:expenseId', deleteExpense);

export default router;
