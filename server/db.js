const mysql = require('mysql2/promise');
require('dotenv').config();

// Connection pool (like your PDO connection file in PHP)
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

module.exports = db;
