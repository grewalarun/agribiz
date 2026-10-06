import Crop from '../models/Crop.js';

export async function createCrop(req, res) {
  try {
    const { name, localName, category, defaultUnit, defaultAreaUnit, active } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Crop name is required' });
    }

    const crop = await Crop.create({
      name,
      localName,
      category,
      defaultUnit: defaultUnit || 'QTL',
      defaultAreaUnit: defaultAreaUnit || 'ACRE',
      active: active !== undefined ? active : true
    });

    return res.status(201).json({ crop });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function getCrops(req, res) {
  try {
    const crops = await Crop.find().sort({ createdAt: -1 });
    return res.status(200).json({ crops });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function getCropById(req, res) {
  try {
    const { cropId } = req.params;
    const crop = await Crop.findById(cropId);

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
    const crop = await Crop.findById(cropId);

    if (!crop) {
      return res.status(404).json({ message: 'Crop not found' });
    }

    Object.keys(req.body).forEach((key) => {
      crop[key] = req.body[key];
    });

    await crop.save();
    return res.status(200).json({ crop });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function deleteCrop(req, res) {
  try {
    const { cropId } = req.params;
    const crop = await Crop.findById(cropId);

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
