const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Add it to your environment variables.');
  }

  mongoose.set('strictQuery', true);

  await mongoose.connect(uri, {
    // Modern mongoose (6+/8+) no longer needs useNewUrlParser/useUnifiedTopology,
    // but we keep the connection resilient with sensible timeouts.
    serverSelectionTimeoutMS: 10000,
  });

  console.log('[db] Connected to MongoDB Atlas');

  mongoose.connection.on('disconnected', () => {
    console.warn('[db] MongoDB disconnected — mongoose will attempt to reconnect');
  });
  mongoose.connection.on('error', (err) => {
    console.error('[db] MongoDB connection error:', err.message);
  });
}

module.exports = connectDB;
