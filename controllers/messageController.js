import crypto from 'crypto';
import Message from '../models/Message.js';
import MessageRecipient from '../models/MessageRecipient.js';
import { EmailError, isEmailConfigured, sendEmail, sendEmailBatch } from '../utils/email.js';
import { announcementEmailTemplate } from '../utils/emailTemplates.js';
import { parseAudience, resolveAudience } from '../utils/audience.js';
import { unsubscribeUrl } from '../utils/unsubscribe.js';
import { handleError } from '../utils/errors.js';

const MAX_SUBJECT = 150;
const MAX_BODY = 5000;
// Emails sent per request. The admin page keeps calling /send until nothing is left,
// so one request stays short enough for a serverless function.
const CHUNK_SIZE = 50;
// A claimed recipient that never finished (the request died) goes back in the queue after this
const STALE_CLAIM_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const dailyCap = () => Number(process.env.ADMIN_EMAIL_DAILY_CAP) || 100;

function readContent(body, { partial = false } = {}) {
  const out = {};
  for (const [key, max, label] of [['subject', MAX_SUBJECT, 'Subject'], ['body', MAX_BODY, 'Message']]) {
    if (body[key] === undefined && partial) continue;
    const value = String(body[key] ?? '').trim();
    if (!value) return { error: `${label} is required` };
    if (value.length > max) return { error: `${label} can be at most ${max} characters` };
    out[key] = value;
  }
  return { content: out };
}

const toJson = (message) => ({
  id: message._id,
  channels: message.channels,
  subject: message.subject,
  body: message.body,
  audience: message.audience,
  status: message.status,
  targeted: message.targeted,
  sent: message.sent,
  failed: message.failed,
  pending: Math.max(0, message.targeted - message.sent - message.failed),
  createdAt: message.createdAt,
  sentAt: message.sentAt
});

async function findMessage(req, res) {
  const message = await Message.findById(req.params.messageId);
  if (!message) {
    res.status(404).json({ message: 'Message not found' });
    return null;
  }
  return message;
}

// Emails already sent in the last 24 hours, for the daily cap
async function sentToday() {
  return MessageRecipient.countDocuments({ channel: 'email', status: 'SENT', sentAt: { $gte: new Date(Date.now() - DAY_MS) } });
}

// POST /api/admin/messages/audience { audience } — how many people a choice would reach
export async function previewAudience(req, res) {
  try {
    const { audience, error } = parseAudience(req.body.audience);
    if (error) return res.status(400).json({ message: error });
    const users = await resolveAudience(audience);
    return res.status(200).json({
      count: users.length,
      sample: users.slice(0, 5).map((user) => ({ name: user.name, email: user.email })),
      dailyCap: dailyCap(),
      sentToday: await sentToday()
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// POST /api/admin/messages — saves a draft
export async function createMessage(req, res) {
  try {
    const { content, error } = readContent(req.body);
    if (error) return res.status(400).json({ message: error });
    const parsed = parseAudience(req.body.audience);
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    const message = await Message.create({ ...content, audience: parsed.audience, createdBy: req.user._id });
    return res.status(201).json({ message: toJson(message) });
  } catch (error) {
    return handleError(res, error);
  }
}

// GET /api/admin/messages?page&limit
export async function listMessages(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const [total, messages] = await Promise.all([
      Message.countDocuments(),
      Message.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
    ]);
    return res.status(200).json({ page, limit, total, dailyCap: dailyCap(), sentToday: await sentToday(), messages: messages.map(toJson) });
  } catch (error) {
    return handleError(res, error);
  }
}

// GET /api/admin/messages/:messageId — with the first failures so they can be read
export async function getMessage(req, res) {
  try {
    const message = await findMessage(req, res);
    if (!message) return;
    const failures = await MessageRecipient.find({ messageId: message._id, status: 'FAILED' })
      .select('name address error')
      .limit(50)
      .lean();
    return res.status(200).json({ message: toJson(message), failures });
  } catch (error) {
    return handleError(res, error);
  }
}

// PATCH /api/admin/messages/:messageId — drafts only
export async function updateMessage(req, res) {
  try {
    const message = await findMessage(req, res);
    if (!message) return;
    if (message.status !== 'DRAFT') return res.status(409).json({ message: 'Only drafts can be edited' });

    const { content, error } = readContent(req.body, { partial: true });
    if (error) return res.status(400).json({ message: error });
    if (req.body.audience !== undefined) {
      const parsed = parseAudience(req.body.audience);
      if (parsed.error) return res.status(400).json({ message: parsed.error });
      message.audience = parsed.audience;
    }
    message.set(content);
    await message.save();
    return res.status(200).json({ message: toJson(message) });
  } catch (error) {
    return handleError(res, error);
  }
}

// DELETE /api/admin/messages/:messageId — drafts only
export async function deleteMessage(req, res) {
  try {
    const message = await findMessage(req, res);
    if (!message) return;
    if (message.status !== 'DRAFT') return res.status(409).json({ message: 'Only drafts can be deleted' });
    await message.deleteOne();
    return res.status(200).json({ id: message._id });
  } catch (error) {
    return handleError(res, error);
  }
}

// POST /api/admin/messages/:messageId/test — sends the message to the admin only
export async function sendTestMessage(req, res) {
  try {
    const message = await findMessage(req, res);
    if (!message) return;
    const email = announcementEmailTemplate({
      subject: `[Test] ${message.subject}`,
      body: message.body,
      name: req.user.name,
      language: req.user.language,
      unsubscribeUrl: unsubscribeUrl(req.user._id)
    });
    const { id } = await sendEmail({ to: req.user.email, ...email });
    return res.status(200).json({ id, to: req.user.email });
  } catch (error) {
    if (error instanceof EmailError) return res.status(error.status).json({ message: error.message });
    return handleError(res, error);
  }
}

// Turns the audience into one pending recipient row each and checks the daily cap
async function startSending(message) {
  const users = await resolveAudience(message.audience);
  if (users.length === 0) return { error: 'No users match this audience', status: 400 };

  const used = await sentToday();
  if (used + users.length > dailyCap()) {
    return {
      status: 429,
      error: `Daily limit: ${used} emails were sent in the last 24 hours and this would add ${users.length}, over the limit of ${dailyCap()}. Choose a smaller audience or try later.`
    };
  }

  await MessageRecipient.insertMany(
    users.map((user) => ({
      messageId: message._id,
      userId: user._id,
      channel: 'email',
      address: user.email,
      name: user.name,
      language: user.language
    }))
  );
  message.status = 'SENDING';
  message.targeted = users.length;
  message.sent = 0;
  message.failed = 0;
  await message.save();
  return {};
}

// Sends the next chunk of pending recipients
async function sendChunk(message) {
  // Put recipients abandoned by a dead request back in the queue
  await MessageRecipient.updateMany(
    { messageId: message._id, status: 'SENDING', updatedAt: { $lt: new Date(Date.now() - STALE_CLAIM_MS) } },
    { $set: { status: 'PENDING' }, $unset: { claimId: 1 } }
  );

  // Claim a chunk, so two requests at once never send the same email twice
  const pendingIds = (await MessageRecipient.find({ messageId: message._id, status: 'PENDING' }).select('_id').limit(CHUNK_SIZE).lean()).map((r) => r._id);
  const claimId = crypto.randomUUID();
  await MessageRecipient.updateMany({ _id: { $in: pendingIds }, status: 'PENDING' }, { $set: { status: 'SENDING', claimId } });
  const claimed = await MessageRecipient.find({ messageId: message._id, claimId, status: 'SENDING' });

  if (claimed.length) {
    let results;
    try {
      results = await sendEmailBatch(
        claimed.map((r) => ({
          to: r.address,
          headers: { 'List-Unsubscribe': `<${unsubscribeUrl(r.userId)}>` },
          ...announcementEmailTemplate({
            subject: message.subject,
            body: message.body,
            name: r.name || '',
            language: r.language,
            unsubscribeUrl: unsubscribeUrl(r.userId)
          })
        }))
      );
    } catch (error) {
      // The whole request failed: mark the chunk failed so "retry failed" can pick it up
      const reason = error instanceof EmailError ? error.message : 'Unexpected error while sending';
      if (!(error instanceof EmailError)) console.error(error);
      results = claimed.map(() => ({ error: reason }));
    }
    const now = new Date();
    await MessageRecipient.bulkWrite(
      claimed.map((r, i) => ({
        updateOne: {
          filter: { _id: r._id },
          update: results[i].error
            ? { $set: { status: 'FAILED', error: String(results[i].error).slice(0, 300) }, $unset: { claimId: 1 } }
            : { $set: { status: 'SENT', providerId: results[i].id, sentAt: now }, $unset: { claimId: 1, error: 1 } }
        }
      }))
    );
  }

  await refreshCounts(message);
}

async function refreshCounts(message) {
  const rows = await MessageRecipient.aggregate([
    { $match: { messageId: message._id } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);
  const count = Object.fromEntries(rows.map((row) => [row._id, row.count]));
  message.sent = count.SENT ?? 0;
  message.failed = count.FAILED ?? 0;
  if (!count.PENDING && !count.SENDING) {
    message.status = message.failed === 0 ? 'SENT' : message.sent === 0 ? 'FAILED' : 'PARTIAL';
    message.sentAt ??= new Date();
  } else {
    message.status = 'SENDING';
  }
  await message.save();
}

// POST /api/admin/messages/:messageId/send { retryFailed? }
// Starts a draft, or continues a message that is still sending. Each call sends one
// chunk and returns the progress; the admin page repeats it until `pending` is 0.
// With retryFailed, failed deliveries are queued again (this counts against the daily cap).
export async function sendMessage(req, res) {
  try {
    if (!isEmailConfigured()) {
      return res.status(503).json({ message: 'Email is not configured on the server (RESEND_API_KEY missing)' });
    }
    const message = await findMessage(req, res);
    if (!message) return;

    if (message.status === 'DRAFT') {
      const started = await startSending(message);
      if (started.error) return res.status(started.status).json({ message: started.error });
    } else if (req.body.retryFailed === true) {
      if (message.status === 'SENDING') return res.status(409).json({ message: 'This message is still sending' });
      const failed = await MessageRecipient.countDocuments({ messageId: message._id, status: 'FAILED' });
      if (failed === 0) return res.status(409).json({ message: 'Nothing failed to retry' });
      const used = await sentToday();
      if (used + failed > dailyCap()) {
        return res.status(429).json({ message: `Daily limit: retrying ${failed} would go over ${dailyCap()} emails in 24 hours.` });
      }
      await MessageRecipient.updateMany({ messageId: message._id, status: 'FAILED' }, { $set: { status: 'PENDING' }, $unset: { error: 1 } });
      message.status = 'SENDING';
      await message.save();
    } else if (!['SENDING'].includes(message.status)) {
      return res.status(409).json({ message: 'This message has already been sent' });
    }

    await sendChunk(message);
    return res.status(200).json({ message: toJson(message) });
  } catch (error) {
    if (error instanceof EmailError) return res.status(error.status).json({ message: error.message });
    return handleError(res, error);
  }
}
