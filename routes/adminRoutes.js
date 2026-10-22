import express from 'express';
import {
  getOverview,
  getSignups,
  getActivity,
  getBreakdowns,
  getPlatforms,
  listUsers,
  setUserStatus
} from '../controllers/adminController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin.js';
import { validateObjectId } from '../middleware/validateObjectId.js';

const router = express.Router();

router.use(authenticate, requireSuperAdmin);
router.param('userId', validateObjectId);

router.get('/overview', getOverview);
router.get('/signups', getSignups);
router.get('/activity', getActivity);
router.get('/breakdowns', getBreakdowns);
router.get('/platforms', getPlatforms);
router.get('/users', listUsers);
router.patch('/users/:userId/status', setUserStatus);

export default router;
