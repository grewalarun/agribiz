import mongoose from 'mongoose';
import { SEASON_TYPES, getSeasonLabel } from '../utils/season.js';

export const CYCLE_STATUSES = ['PLANNED', 'ACTIVE', 'HARVESTED', 'CLOSED'];

const cropCycleSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    farmId: { type: mongoose.Schema.Types.ObjectId, ref: 'Farm', required: true },
    fieldId: { type: mongoose.Schema.Types.ObjectId, ref: 'Field', required: true },
    cropId: { type: mongoose.Schema.Types.ObjectId, ref: 'Crop', required: true },
    seasonType: { type: String, enum: SEASON_TYPES, required: true },
    // derived from seasonType + startDate, e.g. "2026-27" for Rabi, "2026" for Kharif
    seasonYear: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    status: { type: String, enum: CYCLE_STATUSES, default: 'ACTIVE' },
    expectedYield: { type: Number, min: 0 },
    yieldUnit: { type: String, default: 'QTL', trim: true },
    notes: { type: String, trim: true }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

cropCycleSchema.virtual('season').get(function () {
  return getSeasonLabel(this.seasonType, this.seasonYear);
});

// Only one ACTIVE cycle per field at a time
cropCycleSchema.index({ fieldId: 1 }, { unique: true, partialFilterExpression: { status: 'ACTIVE' } });
cropCycleSchema.index({ userId: 1, seasonType: 1, seasonYear: 1 });

const CropCycle = mongoose.model('CropCycle', cropCycleSchema);

export default CropCycle;
