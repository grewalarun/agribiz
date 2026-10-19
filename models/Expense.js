import mongoose from 'mongoose';

export const EXPENSE_CATEGORIES = [
  'SEEDS',
  'FERTILIZER',
  'PESTICIDE',
  'LABOUR',
  'IRRIGATION',
  'MACHINERY',
  'TRANSPORT',
  'OTHER'
];

const expenseSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    farmId: { type: mongoose.Schema.Types.ObjectId, ref: 'Farm', required: true },
    fieldId: { type: mongoose.Schema.Types.ObjectId, ref: 'Field', required: true },
    cycleId: { type: mongoose.Schema.Types.ObjectId, ref: 'CropCycle', required: true },
    category: { type: String, enum: EXPENSE_CATEGORIES, required: true },
    description: { type: String, trim: true },
    notes: { type: String, trim: true },
    amount: { type: Number, required: true, min: 0.01 },
    date: { type: Date, required: true }
  },
  { timestamps: true }
);

expenseSchema.index({ cycleId: 1, date: -1 });
expenseSchema.index({ userId: 1, date: -1 });

const Expense = mongoose.model('Expense', expenseSchema);

export default Expense;
