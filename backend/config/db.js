const mongoose = require('mongoose');

const isMongoConfigured = () => Boolean(process.env.MONGO_URI && process.env.MONGO_URI.trim());

const connectDB = async () => {
  if (!isMongoConfigured()) {
    console.warn('MONGO_URI is not configured. Continuing in demo mode with in-memory fallback data.');
    return false;
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected successfully');
    return true;
  } catch (error) {
    console.warn('MongoDB connection failed. Continuing in demo mode with in-memory fallback data:', error.message);
    return false;
  }
};

const isDbReady = () => mongoose.connection.readyState === 1;

module.exports = {
  connectDB,
  isDbReady,
};
