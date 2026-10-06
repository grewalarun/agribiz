import Farm from '../models/Farm.js';
import Field from '../models/Field.js';

export async function createFarm(req, res) {
  try {
    const { name, totalArea, areaUnit, location, irrigationType, soilType, notes } = req.body;

    if (!name || !totalArea) {
      return res.status(400).json({ message: 'Name and totalArea are required' });
    }

    const farm = await Farm.create({
      userId: req.user._id,
      name,
      totalArea,
      areaUnit: areaUnit || 'ACRE',
      location,
      irrigationType,
      soilType,
      notes
    });

    return res.status(201).json({ farm });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function getFarms(req, res) {
  try {
    const farms = await Farm.find({ userId: req.user._id }).sort({ createdAt: -1 });
    return res.status(200).json({ farms });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function getFarmById(req, res) {
  try {
    const { farmId } = req.params;
    const farm = await Farm.findOne({ _id: farmId, userId: req.user._id });

    if (!farm) {
      return res.status(404).json({ message: 'Farm not found' });
    }

    return res.status(200).json({ farm });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function updateFarm(req, res) {
  try {
    const { farmId } = req.params;
    const updates = req.body;

    const farm = await Farm.findOne({ _id: farmId, userId: req.user._id });
    if (!farm) {
      return res.status(404).json({ message: 'Farm not found' });
    }

    Object.keys(updates).forEach((key) => {
      farm[key] = updates[key];
    });

    await farm.save();
    return res.status(200).json({ farm });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function deleteFarm(req, res) {
  try {
    const { farmId } = req.params;

    const farm = await Farm.findOne({ _id: farmId, userId: req.user._id });
    if (!farm) {
      return res.status(404).json({ message: 'Farm not found' });
    }

    await Field.deleteMany({ farmId: farm._id });
    await farm.deleteOne();

    return res.status(200).json({ message: 'Farm deleted successfully' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function createField(req, res) {
  try {
    const { farmId } = req.params;
    const { name, area, areaUnit, soilType, irrigationType, notes } = req.body;

    const farm = await Farm.findOne({ _id: farmId, userId: req.user._id });
    if (!farm) {
      return res.status(404).json({ message: 'Farm not found' });
    }

    if (!name || !area) {
      return res.status(400).json({ message: 'Name and area are required' });
    }

    const field = await Field.create({
      farmId,
      name,
      area,
      areaUnit: areaUnit || 'ACRE',
      soilType,
      irrigationType,
      notes
    });

    return res.status(201).json({ field });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function getFieldsByFarm(req, res) {
  try {
    const { farmId } = req.params;
    const farm = await Farm.findOne({ _id: farmId, userId: req.user._id });
    if (!farm) {
      return res.status(404).json({ message: 'Farm not found' });
    }

    const fields = await Field.find({ farmId }).sort({ createdAt: -1 });
    return res.status(200).json({ fields });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
}
