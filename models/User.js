import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    // UI language chosen by the user; the frontend applies it on every device
    language: { type: String, enum: ['en', 'hi', 'pa'], default: 'en' },
    // when this user last sent a test email; used to allow one per minute
    lastTestEmailAt: { type: Date },
    password: { type: String, required: true },
    status: { type: String, enum: ['enabled', 'disabled'], default: 'enabled' },
    // store refresh tokens (simple implementation). For higher security, store hashes instead.
    refreshTokens: [
      {
        token: { type: String },
        createdAt: { type: Date, default: Date.now }
      }
    ]
  },
  {
    timestamps: { createdAt: 'createdOn', updatedAt: 'updatedOn' }
  }
);

const User = mongoose.model('User', userSchema);

export default User;
