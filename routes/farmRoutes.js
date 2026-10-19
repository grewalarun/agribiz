import express from 'express';
import {
  createFarm,
  getFarms,
  getFarmById,
  updateFarm,
  deleteFarm,
  createField,
  getFieldsByFarm
} from '../controllers/farmController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { validateObjectId } from '../middleware/validateObjectId.js';

const router = express.Router();

router.use(authenticate);
router.param('farmId', validateObjectId);

router.post('/', createFarm);
router.get('/', getFarms);
router.get('/:farmId', getFarmById);
router.patch('/:farmId', updateFarm);
router.delete('/:farmId', deleteFarm);
router.post('/:farmId/fields', createField);
router.get('/:farmId/fields', getFieldsByFarm);

export default router;
