import mongoose from 'mongoose';

const cropSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    localName: { type: String, trim: true },
    category: { type: String, trim: true },
    defaultUnit: { type: String, default: 'QTL', trim: true },
    defaultAreaUnit: { type: String, default: 'ACRE', enum: ['ACRE', 'HECTARE', 'BIGHA'] },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

const Crop = mongoose.model('Crop', cropSchema);

export default Crop;
