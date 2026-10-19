import express from 'express';
import { getHarvests, getHarvestById, updateHarvest, deleteHarvest } from '../controllers/harvestController.js';
import { createSale, getSalesByHarvest } from '../controllers/saleController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { validateObjectId } from '../middleware/validateObjectId.js';

const router = express.Router();

router.use(authenticate);
router.param('harvestId', validateObjectId);

router.get('/', getHarvests);
router.get('/:harvestId', getHarvestById);
router.patch('/:harvestId', updateHarvest);
router.delete('/:harvestId', deleteHarvest);
router.post('/:harvestId/sales', createSale);
router.get('/:harvestId/sales', getSalesByHarvest);

export default router;
