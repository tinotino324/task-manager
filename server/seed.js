// Creates an admin user so you can log in.
// Usage:  npm run seed -- admin@example.com yourPassword "Admin Name"
// If the email already exists, that user is made an admin and gets the new password.
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { connectDB } = require('./db');
const User = require('./models/User');
const { CASE_INSENSITIVE } = require('./models/User');
const { ROLE_ADMIN } = require('./middleware/auth');

async function seed() {
  const [email, password, name = 'Admin'] = process.argv.slice(2);
  if (!email || !password) {
    throw new Error('Usage: npm run seed -- <email> <password> [name]');
  }
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }

  await connectDB();
  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await User.findOne({ email }).collation(CASE_INSENSITIVE);

  if (existing) {
    existing.role = ROLE_ADMIN;
    existing.password_hash = passwordHash;
    await existing.save();
    console.log(`Updated ${existing.email}: now an admin, with the new password.`);
  } else {
    await User.create({ name, email, password_hash: passwordHash, role: ROLE_ADMIN });
    console.log(`Created admin ${email}.`);
  }
}

seed()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
