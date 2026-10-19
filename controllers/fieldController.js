import Field from '../models/Field.js';
import Farm from '../models/Farm.js';
import { pick } from '../utils/pick.js';

const UPDATABLE_FIELDS = ['name', 'area', 'areaUnit', 'soilType', 'irrigationType', 'notes', 'status'];

export async function getFieldById(req, res) {
  try {
    const { fieldId } = req.params;
    const field = await Field.findById(fieldId);

    if (!field) {
      return res.status(404).json({ message: 'Field not found' });
    }

    const farm = await Farm.findOne({ _id: field.farmId, userId: req.user._id });
    if (!farm) {
      return res.status(403).json({ message: 'You do not have access to this field' });
    }

    return res.status(200).json({ field });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function updateField(req, res) {
  try {
    const { fieldId } = req.params;
    const field = await Field.findById(fieldId);

    if (!field) {
      return res.status(404).json({ message: 'Field not found' });
    }

    const farm = await Farm.findOne({ _id: field.farmId, userId: req.user._id });
    if (!farm) {
      return res.status(403).json({ message: 'You do not have access to this field' });
    }

    field.set(pick(req.body, UPDATABLE_FIELDS));

    await field.save();
    return res.status(200).json({ field });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function deleteField(req, res) {
  try {
    const { fieldId } = req.params;
    const field = await Field.findById(fieldId);

    if (!field) {
      return res.status(404).json({ message: 'Field not found' });
    }

    const farm = await Farm.findOne({ _id: field.farmId, userId: req.user._id });
    if (!farm) {
      return res.status(403).json({ message: 'You do not have access to this field' });
    }

    await field.deleteOne();
    return res.status(200).json({ message: 'Field deleted successfully' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
}
