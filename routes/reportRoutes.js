import express from 'express';
import { getCycleReport, getFieldReport, getSeasonsReport, getSeasonReport } from '../controllers/reportController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { validateObjectId } from '../middleware/validateObjectId.js';

const router = express.Router();

router.use(authenticate);
router.param('cycleId', validateObjectId);
router.param('fieldId', validateObjectId);

router.get('/cycles/:cycleId', getCycleReport);
router.get('/fields/:fieldId', getFieldReport);
router.get('/seasons', getSeasonsReport);
router.get('/seasons/:seasonType/:seasonYear', getSeasonReport);

export default router;
