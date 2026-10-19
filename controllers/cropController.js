import Crop from '../models/Crop.js';
import { pick } from '../utils/pick.js';

const UPDATABLE_FIELDS = ['name', 'localName', 'category', 'defaultUnit', 'defaultAreaUnit', 'active'];

export async function createCrop(req, res) {
  try {
    const { name, localName, category, defaultUnit, defaultAreaUnit, active } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Crop name is required' });
    }

    const crop = await Crop.create({
      userId: req.user._id,
      name,
      localName,
      category,
      defaultUnit: defaultUnit || 'QTL',
      defaultAreaUnit: defaultAreaUnit || 'ACRE',
      active: active !== undefined ? active : true
    });

    return res.status(201).json({ crop });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Crop with this name already exists' });
    }
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function getCrops(req, res) {
  try {
    const crops = await Crop.find({ userId: req.user._id }).sort({ createdAt: -1 });
    return res.status(200).json({ crops });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function getCropById(req, res) {
  try {
    const { cropId } = req.params;
    const crop = await Crop.findOne({ _id: cropId, userId: req.user._id });

    if (!crop) {
      return res.status(404).json({ message: 'Crop not found' });
    }

    return res.status(200).json({ crop });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function updateCrop(req, res) {
  try {
    const { cropId } = req.params;
    const crop = await Crop.findOne({ _id: cropId, userId: req.user._id });

    if (!crop) {
      return res.status(404).json({ message: 'Crop not found' });
    }

    crop.set(pick(req.body, UPDATABLE_FIELDS));

    await crop.save();
    return res.status(200).json({ crop });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Crop with this name already exists' });
    }
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function deleteCrop(req, res) {
  try {
    const { cropId } = req.params;
    const crop = await Crop.findOne({ _id: cropId, userId: req.user._id });

    if (!crop) {
      return res.status(404).json({ message: 'Crop not found' });
    }

    await crop.deleteOne();
    return res.status(200).json({ message: 'Crop deleted successfully' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
}
