const User = require('../models/User');

const getFieldOfficers = async (req, res) => {
  try {
    const officers = await User.find({ role: 'field_officer' })
      .select('name email role department isDemo')
      .sort({ name: 1 })
      .limit(500)
      .lean();
    return res.status(200).json({ officers });
  } catch (error) {
    console.error('Failed to load field officers:', error.message);
    return res.status(500).json({ message: 'Failed to load field officers' });
  }
};

module.exports = { getFieldOfficers };
