const mongoose = require('mongoose');
require('dotenv').config();

// Opens the MongoDB connection. index.js waits for this before it starts listening.
async function connectDB(uri = process.env.MONGO_URI) {
  if (!uri) {
    throw new Error('MONGO_URI is not set in server/.env');
  }
  await mongoose.connect(uri);

  // Make sure the indexes (like the unique email) exist before the first request
  await Promise.all([require('./models/User').init(), require('./models/Task').init()]);
}

module.exports = { connectDB };
