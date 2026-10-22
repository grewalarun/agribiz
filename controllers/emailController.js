import mongoose from 'mongoose';
import User from '../models/User.js';
import { EmailError, sendEmail } from '../utils/email.js';
import { escapeHtml, testEmailTemplate } from '../utils/emailTemplates.js';
import { handleError } from '../utils/errors.js';
import { isValidUnsubscribe } from '../utils/unsubscribe.js';

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

const page = (title, text) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#faf9f5;display:flex;min-height:100vh;align-items:center;justify-content:center;">
<div style="max-width:420px;margin:16px;padding:28px;background:#fff;border:1px solid #ecebe4;border-radius:12px;text-align:center;">
<div style="font-size:22px;font-weight:800;color:#166534;">Farm<span style="color:#ca8a04;">Paisa</span></div>
<h1 style="font-size:18px;color:#14532d;">${escapeHtml(title)}</h1><p style="color:#4b5563;font-size:14px;line-height:1.5;">${escapeHtml(text)}</p></div></body></html>`;

// GET /api/email/unsubscribe?u=<userId>&t=<token> — the link in announcement emails.
// Account emails such as verification codes are still sent. Settings can switch announcements back on.
export async function unsubscribe(req, res) {
  try {
    const { u, t } = req.query;
    if (!mongoose.isValidObjectId(u) || !isValidUnsubscribe(u, t)) {
      return res.status(400).type('html').send(page('Link not valid', 'This unsubscribe link is not valid. You can turn announcement emails off in FarmPaisa under Settings.'));
    }
    await User.updateOne({ _id: u }, { $set: { emailOptOut: true } });
    return res.status(200).type('html').send(page('You are unsubscribed', 'You will no longer get announcement emails from FarmPaisa. You can turn them back on in Settings.'));
  } catch (error) {
    console.error(error);
    return res.status(500).type('html').send(page('Something went wrong', 'Please try again in a moment.'));
  }
}
