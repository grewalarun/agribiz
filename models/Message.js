import mongoose from 'mongoose';

export const MESSAGE_STATUSES = ['DRAFT', 'SENDING', 'SENT', 'PARTIAL', 'FAILED'];
export const AUDIENCE_TYPES = ['all', 'group', 'users'];

// An announcement written by an admin. `channels` is ['email'] today; the mobile app
// adds 'push' later, using the same audience and recipient log.
const messageSchema = new mongoose.Schema(
  {
    channels: { type: [String], enum: ['email', 'push'], default: ['email'] },
    subject: { type: String, required: true, trim: true, maxlength: 150 },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    audience: {
      type: { type: String, enum: AUDIENCE_TYPES, required: true },
      userIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      language: { type: String, enum: ['en', 'hi', 'pa'] },
      state: { type: String, trim: true },
      hasActiveCycle: { type: Boolean },
      signedUpWithinDays: { type: Number, min: 1, max: 3650 }
    },
    status: { type: String, enum: MESSAGE_STATUSES, default: 'DRAFT' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sentAt: { type: Date },
    targeted: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 }
  },
  { timestamps: true }
);

messageSchema.index({ createdAt: -1 });

export default mongoose.model('Message', messageSchema);
