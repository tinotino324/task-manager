const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { CASE_INSENSITIVE } = require('../models/User');
const { ROLE_USER } = require('../middleware/auth');

async function register(req, res) {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const existing = await User.findOne({ email }, '_id').collation(CASE_INSENSITIVE).lean();
    if (existing) {
      return res.status(409).json({ error: 'This email is already registered' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password_hash: passwordHash, role: ROLE_USER });
    res.status(201).json({ id: String(user._id), message: 'Account created' });
  } catch (err) {
    // Two people registering the same email at the same moment: the unique index catches it
    if (err.code === 11000) {
      return res.status(409).json({ error: 'This email is already registered' });
    }
    res.status(500).json({ error: err.message });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const user = await User.findOne({ email }).collation(CASE_INSENSITIVE).lean();
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const id = String(user._id);
    const token = jwt.sign({ id, name: user.name, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: '1d',
    });
    res.json({
      token,
      user: { id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { register, login };
