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
    // Not set for accounts that only sign in with Google
    password: { type: String },
    // Set when the user signs in with Google (links to the same-email account)
    googleId: { type: String, unique: true, sparse: true },
    status: { type: String, enum: ['enabled', 'disabled'], default: 'enabled' },
    // 'superadmin' only counts while the email is in SUPER_ADMIN_EMAILS (see utils/admin.js)
    role: { type: String, enum: ['user', 'superadmin'], default: 'user' },
    // Opted out of announcement emails (OTP and other account emails still go out)
    emailOptOut: { type: Boolean, default: false },
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
