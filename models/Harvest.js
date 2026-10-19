import mongoose from 'mongoose';

export const HARVEST_QUALITIES = ['A', 'B', 'C'];

// Avoids floating point drift when quantities are added up, e.g. 0.1 + 0.2
const roundQuantity = (value) => (typeof value === 'number' ? Math.round(value * 1000) / 1000 : value);

const harvestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    farmId: { type: mongoose.Schema.Types.ObjectId, ref: 'Farm', required: true },
    fieldId: { type: mongoose.Schema.Types.ObjectId, ref: 'Field', required: true },
    cycleId: { type: mongoose.Schema.Types.ObjectId, ref: 'CropCycle', required: true },
    cropId: { type: mongoose.Schema.Types.ObjectId, ref: 'Crop', required: true },
    quantity: { type: Number, required: true, min: 0.001, set: roundQuantity },
    unit: { type: String, required: true, trim: true },
    quality: { type: String, enum: HARVEST_QUALITIES },
    date: { type: Date, required: true },
    notes: { type: String, trim: true },
    // kept in sync by sale create/update/delete so stock checks are atomic
    soldQuantity: { type: Number, default: 0, min: 0, set: roundQuantity }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

harvestSchema.virtual('remainingQuantity').get(function () {
  return roundQuantity(this.quantity - this.soldQuantity);
});

harvestSchema.index({ cycleId: 1, date: -1 });
harvestSchema.index({ userId: 1, date: -1 });

const Harvest = mongoose.model('Harvest', harvestSchema);

export { roundQuantity };
export default Harvest;
