import mongoose from 'mongoose';

const fieldSchema = new mongoose.Schema(
  {
    farmId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Farm',
      required: true
    },
    name: { type: String, required: true, trim: true },
    area: { type: Number, required: true },
    areaUnit: {
      type: String,
      enum: ['ACRE', 'HECTARE', 'BIGHA', 'KANAL'],
      default: 'ACRE'
    },
    soilType: { type: String, trim: true },
    irrigationType: { type: String, trim: true },
    notes: { type: String, trim: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE'
    }
  },
  {
    timestamps: true
  }
);

const Field = mongoose.model('Field', fieldSchema);

export default Field;
