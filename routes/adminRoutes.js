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
import {
  previewAudience,
  createMessage,
  listMessages,
  getMessage,
  updateMessage,
  deleteMessage,
  sendTestMessage,
  sendMessage
} from '../controllers/messageController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin.js';
import { validateObjectId } from '../middleware/validateObjectId.js';

const router = express.Router();

router.use(authenticate, requireSuperAdmin);
router.param('userId', validateObjectId);
router.param('messageId', validateObjectId);

router.get('/overview', getOverview);
router.get('/signups', getSignups);
router.get('/activity', getActivity);
router.get('/breakdowns', getBreakdowns);
router.get('/platforms', getPlatforms);
router.get('/users', listUsers);
router.patch('/users/:userId/status', setUserStatus);

router.post('/messages/audience', previewAudience);
router.get('/messages', listMessages);
router.post('/messages', createMessage);
router.get('/messages/:messageId', getMessage);
router.patch('/messages/:messageId', updateMessage);
router.delete('/messages/:messageId', deleteMessage);
router.post('/messages/:messageId/test', sendTestMessage);
router.post('/messages/:messageId/send', sendMessage);

export default router;
