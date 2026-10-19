import mongoose from 'mongoose';

// Use with router.param(name, validateObjectId) to reject malformed ids with 400.
export function validateObjectId(req, res, next, value, name) {
  if (!mongoose.isValidObjectId(value)) {
    return res.status(400).json({ message: `Invalid ${name}` });
  }
  next();
}
