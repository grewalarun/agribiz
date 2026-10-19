import mongoose from 'mongoose';
import { roundQuantity } from './Harvest.js';

const saleSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    farmId: { type: mongoose.Schema.Types.ObjectId, ref: 'Farm', required: true },
    fieldId: { type: mongoose.Schema.Types.ObjectId, ref: 'Field', required: true },
    cycleId: { type: mongoose.Schema.Types.ObjectId, ref: 'CropCycle', required: true },
    harvestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Harvest', required: true },
    cropId: { type: mongoose.Schema.Types.ObjectId, ref: 'Crop', required: true },
    quantity: { type: Number, required: true, min: 0.001, set: roundQuantity },
    // copied from the harvest; harvest unit is locked once anything is sold
    unit: { type: String, required: true, trim: true },
    pricePerUnit: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    buyer: { type: String, trim: true },
    date: { type: Date, required: true },
    notes: { type: String, trim: true }
  },
  { timestamps: true }
);

saleSchema.index({ cycleId: 1, date: -1 });
saleSchema.index({ harvestId: 1 });
saleSchema.index({ userId: 1, date: -1 });

const Sale = mongoose.model('Sale', saleSchema);

export default Sale;
