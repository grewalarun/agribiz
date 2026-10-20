import User from '../models/User.js';
import { EmailError, sendEmail } from '../utils/email.js';
import { testEmailTemplate } from '../utils/emailTemplates.js';
import { handleError } from '../utils/errors.js';

const TEST_EMAIL_INTERVAL_MS = 60 * 1000;
const MAX_SUBJECT = 150;
const MAX_MESSAGE = 2000;
const DEFAULT_SUBJECT = 'FarmPaisa test email';
// One plain address, e.g. name@example.com (no lists, no display names)
const EMAIL_PATTERN = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]{2,}$/;

// POST /api/email/test — send a test email to any address, at most once a minute per user
export async function sendTestEmail(req, res) {
  try {
    const to = String(req.body.to ?? '').trim();
    const subject = String(req.body.subject ?? '').trim() || DEFAULT_SUBJECT;
    const message = String(req.body.message ?? '').trim();

    if (!EMAIL_PATTERN.test(to)) {
      return res.status(400).json({ message: 'Enter one valid email address' });
    }
    if (subject.length > MAX_SUBJECT) {
      return res.status(400).json({ message: `Subject can be at most ${MAX_SUBJECT} characters` });
    }
    if (message.length > MAX_MESSAGE) {
      return res.status(400).json({ message: `Message can be at most ${MAX_MESSAGE} characters` });
    }

    // Claim the slot atomically so two quick clicks can't both send
    const now = new Date();
    const previous = await User.findOneAndUpdate(
      {
        _id: req.user._id,
        $or: [
          { lastTestEmailAt: { $exists: false } },
          { lastTestEmailAt: null },
          { lastTestEmailAt: { $lte: new Date(now.getTime() - TEST_EMAIL_INTERVAL_MS) } }
        ]
      },
      { $set: { lastTestEmailAt: now } },
      { returnDocument: 'before' }
    );
    if (!previous) {
      const user = await User.findById(req.user._id).select('lastTestEmailAt');
      const retryAfter = Math.max(
        1,
        Math.ceil((user.lastTestEmailAt.getTime() + TEST_EMAIL_INTERVAL_MS - now.getTime()) / 1000)
      );
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ message: `Please wait ${retryAfter} seconds before sending another test email`, retryAfter });
    }

    try {
      const email = testEmailTemplate({ subject, message, senderName: req.user.name, senderEmail: req.user.email });
      const { id } = await sendEmail({ to, ...email });
      return res.status(200).json({ id, to });
    } catch (error) {
      // A failed send shouldn't use up the user's one-per-minute allowance
      await User.updateOne(
        { _id: req.user._id, lastTestEmailAt: now },
        previous.lastTestEmailAt ? { $set: { lastTestEmailAt: previous.lastTestEmailAt } } : { $unset: { lastTestEmailAt: 1 } }
      );
      throw error;
    }
  } catch (error) {
    if (error instanceof EmailError) {
      return res.status(error.status).json({ message: error.message });
    }
    return handleError(res, error);
  }
}
