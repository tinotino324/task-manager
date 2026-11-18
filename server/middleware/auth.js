const jwt = require('jsonwebtoken');

const ROLE_ADMIN = 1;
const ROLE_USER = 2;

// Checks the token and puts the user in req.user
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  console.log('token', token);
  if (!token) {
    return res.status(401).json({ error: 'Please log in' });
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET); // { id, name, role }
    next();
  } catch (err) {
    res.status(401).json({ error: 'Session expired, please log in again' });
  }
}

// Allows only role 1
function adminOnly(req, res, next) {
  if (req.user.role !== ROLE_ADMIN) {
    return res.status(403).json({ error: 'Only an admin can do this' });
  }
  next();
}

module.exports = { auth, adminOnly, ROLE_ADMIN, ROLE_USER };