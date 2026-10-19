import Farm from '../models/Farm.js';
import Field from '../models/Field.js';

// Returns the field only if it belongs to a farm owned by the user, otherwise null.
export async function findOwnedField(fieldId, userId) {
  const field = await Field.findById(fieldId);
  if (!field) {
    return null;
  }

  const farm = await Farm.exists({ _id: field.farmId, userId });
  return farm ? field : null;
}
