import express from 'express';
import { createSeason, getSeasons, getSeasonById, updateSeason, deleteSeason } from '../controllers/seasonController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.post('/', createSeason);
router.get('/', getSeasons);
router.get('/:seasonId', getSeasonById);
router.patch('/:seasonId', updateSeason);
router.delete('/:seasonId', deleteSeason);

export default router;
