import express from 'express';
import { createCrop, getCrops, getCropById, updateCrop, deleteCrop } from '../controllers/cropController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.post('/', createCrop);
router.get('/', getCrops);
router.get('/:cropId', getCropById);
router.patch('/:cropId', updateCrop);
router.delete('/:cropId', deleteCrop);

export default router;
