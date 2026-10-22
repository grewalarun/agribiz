import mongoose from 'mongoose';

// One row per user and channel for a sent message: what happened to that delivery
const recipientSchema = new mongoose.Schema(
  {
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    channel: { type: String, enum: ['email', 'push'], default: 'email' },
    address: { type: String, required: true },
    name: { type: String },
    language: { type: String },
    // SENDING = claimed by a request that is sending it right now
    status: { type: String, enum: ['PENDING', 'SENDING', 'SENT', 'FAILED'], default: 'PENDING' },
    claimId: { type: String },
    providerId: { type: String },
    error: { type: String },
    sentAt: { type: Date }
  },
  { timestamps: true }
);

recipientSchema.index({ messageId: 1, status: 1 });
recipientSchema.index({ channel: 1, status: 1, sentAt: -1 });

export default mongoose.model('MessageRecipient', recipientSchema);
