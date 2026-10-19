import mongoose from 'mongoose';

const farmSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    name: { type: String, required: true, trim: true },
    location: {
      village: { type: String, trim: true },
      district: { type: String, trim: true },
      state: { type: String, trim: true },
      pincode: { type: String, trim: true }
    },
    totalArea: { type: Number, required: true },
    areaUnit: {
      type: String,
      enum: ['ACRE', 'HECTARE', 'BIGHA', 'KANAL'],
      default: 'ACRE'
    },
    irrigationType: { type: String, trim: true },
    soilType: { type: String, trim: true },
    notes: { type: String, trim: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'ARCHIVED'],
      default: 'ACTIVE'
    }
  },
  {
    timestamps: true
  }
);

const Farm = mongoose.model('Farm', farmSchema);

export default Farm;
