import express from 'express';
import { getFieldById, updateField, deleteField } from '../controllers/fieldController.js';
import { createCycle, getCyclesByField } from '../controllers/cycleController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { validateObjectId } from '../middleware/validateObjectId.js';

const router = express.Router();

router.use(authenticate);
router.param('fieldId', validateObjectId);

router.get('/:fieldId', getFieldById);
router.patch('/:fieldId', updateField);
router.delete('/:fieldId', deleteField);
router.post('/:fieldId/cycles', createCycle);
router.get('/:fieldId/cycles', getCyclesByField);

export default router;
