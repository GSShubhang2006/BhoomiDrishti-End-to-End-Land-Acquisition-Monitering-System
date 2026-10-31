const mongoose = require('mongoose');

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI?.trim();
  if (!mongoUri) {
    throw new Error('MONGO_URI is required. Configure the MongoDB connection before starting the API.');
  }

  try {
    await mongoose.connect(mongoUri);
    console.log('MongoDB connected successfully');
    return true;
  } catch (error) {
    throw new Error('MongoDB connection failed. Verify MONGO_URI and database availability.', { cause: error });
  }
};

const isDbReady = () => mongoose.connection.readyState === 1;

module.exports = {
  connectDB,
  isDbReady,
};
