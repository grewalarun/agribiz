import express from 'express';
import { getCycles, getCycleById, updateCycle, deleteCycle } from '../controllers/cycleController.js';
import { createExpense, getExpensesByCycle } from '../controllers/expenseController.js';
import { createHarvest, getHarvestsByCycle } from '../controllers/harvestController.js';
import { getSalesByCycle } from '../controllers/saleController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { validateObjectId } from '../middleware/validateObjectId.js';

const router = express.Router();

router.use(authenticate);
router.param('cycleId', validateObjectId);

router.get('/', getCycles);
router.get('/:cycleId', getCycleById);
router.patch('/:cycleId', updateCycle);
router.delete('/:cycleId', deleteCycle);
router.post('/:cycleId/expenses', createExpense);
router.get('/:cycleId/expenses', getExpensesByCycle);
router.post('/:cycleId/harvests', createHarvest);
router.get('/:cycleId/harvests', getHarvestsByCycle);
router.get('/:cycleId/sales', getSalesByCycle);

export default router;
