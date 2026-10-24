import mongoose from 'mongoose';

// A "forgot password" request: the emailed code lets the user set a new password.
const passwordResetSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  // copied from the user for the email text
  name: { type: String },
  language: { type: String, enum: ['en', 'hi', 'pa'], default: 'en' },
  otp: {
    hash: { type: String },
    expiresAt: { type: Date },
    attempts: { type: Number, default: 0 },
    sentAt: { type: Date }
  },
  // removed by MongoDB an hour after the request
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 }
});

const PasswordReset = mongoose.model('PasswordReset', passwordResetSchema);

export default PasswordReset;
