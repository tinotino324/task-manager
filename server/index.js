const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { connectDB } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// Each route file handles one group of URLs
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/tasks', require('./routes/taskRoutes'));

const PORT = process.env.PORT || 5000;

// Connect to MongoDB first, and only then start accepting requests
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Could not connect to MongoDB:', err.message);
    process.exit(1);
  });
