import Season from '../models/Season.js';

export async function createSeason(req, res) {
  try {
    const { name, code, description, active } = req.body;

    if (!name || !code) {
      return res.status(400).json({ message: 'Name and code are required' });
    }

    const season = await Season.create({
      name,
      code,
      description,
      active: active !== undefined ? active : true
    });

    return res.status(201).json({ season });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function getSeasons(req, res) {
  try {
    const seasons = await Season.find().sort({ createdAt: -1 });
    return res.status(200).json({ seasons });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function getSeasonById(req, res) {
  try {
    const { seasonId } = req.params;
    const season = await Season.findById(seasonId);

    if (!season) {
      return res.status(404).json({ message: 'Season not found' });
    }

    return res.status(200).json({ season });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function updateSeason(req, res) {
  try {
    const { seasonId } = req.params;
    const season = await Season.findById(seasonId);

    if (!season) {
      return res.status(404).json({ message: 'Season not found' });
    }

    Object.keys(req.body).forEach((key) => {
      season[key] = req.body[key];
    });

    await season.save();
    return res.status(200).json({ season });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function deleteSeason(req, res) {
  try {
    const { seasonId } = req.params;
    const season = await Season.findById(seasonId);

    if (!season) {
      return res.status(404).json({ message: 'Season not found' });
    }

    await season.deleteOne();
    return res.status(200).json({ message: 'Season deleted successfully' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
}
