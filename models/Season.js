import mongoose from 'mongoose';

const seasonSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, unique: true },
    description: { type: String, trim: true },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

const Season = mongoose.model('Season', seasonSchema);

export default Season;
