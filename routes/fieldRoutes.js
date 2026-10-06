import express from 'express';
import { getFieldById, updateField, deleteField } from '../controllers/fieldController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/:fieldId', getFieldById);
router.patch('/:fieldId', updateField);
router.delete('/:fieldId', deleteField);

export default router;
