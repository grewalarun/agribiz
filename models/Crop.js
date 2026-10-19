import mongoose from 'mongoose';

const cropSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    name: { type: String, required: true, trim: true },
    localName: { type: String, trim: true },
    category: { type: String, trim: true },
    defaultUnit: { type: String, default: 'QTL', trim: true },
    defaultAreaUnit: { type: String, default: 'ACRE', enum: ['ACRE', 'HECTARE', 'BIGHA'] },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

// A user cannot have two crops with the same name
cropSchema.index({ userId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

const Crop = mongoose.model('Crop', cropSchema);

export default Crop;
