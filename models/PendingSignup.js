import mongoose from 'mongoose';

// A signup waiting for its emailed code. The user account is created only when the
// code from this signup is entered, so nobody can claim an email they don't own.
const pendingSignupSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    name: { type: String, required: true },
    password: { type: String, required: true },
    language: { type: String, enum: ['en', 'hi', 'pa'], default: 'en' },
    otp: {
      hash: { type: String },
      expiresAt: { type: Date },
      attempts: { type: Number, default: 0 },
      sentAt: { type: Date }
    },
    // removed by MongoDB a day after signup
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 }
  }
);

const PendingSignup = mongoose.model('PendingSignup', pendingSignupSchema);

export default PendingSignup;
