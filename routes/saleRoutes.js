import express from 'express';
import { getSales, getSaleById, updateSale, deleteSale } from '../controllers/saleController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { validateObjectId } from '../middleware/validateObjectId.js';

const router = express.Router();

router.use(authenticate);
router.param('saleId', validateObjectId);

router.get('/', getSales);
router.get('/:saleId', getSaleById);
router.patch('/:saleId', updateSale);
router.delete('/:saleId', deleteSale);

export default router;
