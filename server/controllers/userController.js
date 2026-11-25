const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Task = require('../models/Task');
const { CASE_INSENSITIVE } = require('../models/User');
const { ROLE_ADMIN, ROLE_USER } = require('../middleware/auth');
const { containsRegex, isId } = require('../utils');

// Only the safe fields, never the password hash
function toUserResponse(u) {
  return { id: String(u._id), name: u.name, email: u.email, role: u.role };
}

// "Never leave zero admins", without transactions (a standalone MongoDB has none).
// Check-after-write: take away the admin role first, then count the admins.
// If none are left, give the role back and refuse. When two admins race,
// the one who writes second always sees the first one's change, so at worst
// both requests are refused, and the admin count can never stay at zero.
// Returns 'ok' (demoted), 'not_admin' (nothing to do) or 'last_admin' (refused, nothing changed).
async function demoteAdmin(id) {
  const result = await User.updateOne({ _id: id, role: ROLE_ADMIN }, { $set: { role: ROLE_USER } });
  if (result.modifiedCount === 0) return 'not_admin';

  const admins = await User.countDocuments({ role: ROLE_ADMIN });
  if (admins === 0) {
    await User.updateOne({ _id: id }, { $set: { role: ROLE_ADMIN } });
    return 'last_admin';
  }
  return 'ok';
}

// Undo demoteAdmin() when a later step fails
async function restoreAdmin(id) {
  await User.updateOne({ _id: id }, { $set: { role: ROLE_ADMIN } }).catch(() => {});
}

async function getUsersRow(req, res) {
  try {
    const rows = await User.find({}, 'name email role').sort({ name: 1 }).collation(CASE_INSENSITIVE).lean();
    res.json(rows.map(toUserResponse));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getUsers(req, res) {
  try {
    const offset      = parseInt(req.query.offset) || 0;
    const length      = Math.min(parseInt(req.query.length) || 10, 100);
    const keyword     = req.query.keyword || '';

    const sortColumns = {
      name: 'name',
      email: 'email',
      role: 'role'
    };

    const orderBy     = sortColumns[req.query.order_by] || 'created_at';
    const order       = req.query.order === 'ASC' ? 'ASC' : 'DESC';
    const filter      = {};

    if (keyword)
    {
        const like = containsRegex(keyword);
        filter.$or = [{ name: like }, { email: like }];
        // The SQL version also matched "role LIKE '%keyword%'", which is only true when
        // the keyword is exactly "1" or "2"
        if (keyword === String(ROLE_ADMIN) || keyword === String(ROLE_USER)) {
          filter.$or.push({ role: Number(keyword) });
        }
    }

    const [totalCount, rows] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter, 'name email role')
        .sort({ [orderBy]: order === 'ASC' ? 1 : -1, _id: -1 })
        .skip(offset)
        .limit(length)
        .collation(CASE_INSENSITIVE)
        .lean(),
    ]);

    res.json({
      status: true,
      total_counts: totalCount,
      listing_counts: rows.length,
      tasks: rows.map(toUserResponse),
      offset,
      length,
      order,
    });
  } catch (err) {
    res.status(500).json({ status: false, error: err.message });
  }
}

// Admin creates a new user (with any role)
async function createUser(req, res) {
  try {
    const name     = (req.body.name || '').trim();
    const email    = (req.body.email || '').trim();
    const password = req.body.password || '';
    const role     = req.body.role === undefined || req.body.role === '' ? ROLE_USER : Number(req.body.role);

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (role !== ROLE_ADMIN && role !== ROLE_USER) {
      return res.status(400).json({ error: 'Role must be Admin (1) or User (2)' });
    }
    const existing = await User.findOne({ email }, '_id').collation(CASE_INSENSITIVE).lean();
    if (existing) {
      return res.status(409).json({ error: 'This email is already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password_hash: passwordHash, role });

    // Send back only safe fields, never the password hash
    res.status(201).json({
      message: 'User created',
      user: toUserResponse(user),
    });
  } catch (err) {
    // Two admins adding the same email at the same moment: the unique index catches it
    if (err.code === 11000) {
      return res.status(409).json({ error: 'This email is already registered' });
    }
    res.status(500).json({ error: err.message });
  }
}

// Admin edits a user. The password only changes when a new one is sent.
async function updateUser(req, res) {
  const id = req.params.id;
  if (!isId(id)) {
    return res.status(404).json({ error: 'User not found' });
  }

  const name     = (req.body.name || '').trim();
  const email    = (req.body.email || '').trim();
  const password = req.body.password || '';
  const role     = Number(req.body.role);

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }
  if (role !== ROLE_ADMIN && role !== ROLE_USER) {
    return res.status(400).json({ error: 'Role must be Admin (1) or User (2)' });
  }
  if (password && password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  let demoted = false;
  try {
    const found = await User.findById(id, 'role').lean();
    if (!found) {
      return res.status(404).json({ error: 'User not found' });
    }

    const sameEmail = await User.findOne({ email, _id: { $ne: id } }, '_id').collation(CASE_INSENSITIVE).lean();
    if (sameEmail) {
      return res.status(409).json({ error: 'This email is already used by another user' });
    }

    // Turning an admin into a normal user: make sure another admin is left
    if (found.role === ROLE_ADMIN && role !== ROLE_ADMIN) {
      const outcome = await demoteAdmin(id);
      if (outcome === 'last_admin') {
        return res.status(400).json({ error: 'You cannot remove the last admin. Make another user an admin first.' });
      }
      demoted = outcome === 'ok';
    }

    const changes = { name, email, role };
    if (password) {
      changes.password_hash = await bcrypt.hash(password, 10);
    }
    const result = await User.updateOne({ _id: id }, { $set: changes }, { runValidators: true });
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'User not found' }); // deleted in the meantime
    }

    res.json({ message: 'User updated', user: { id, name, email, role } });
  } catch (err) {
    if (demoted) await restoreAdmin(id); // the save failed, so undo the role change too
    if (err.code === 11000) {
      return res.status(409).json({ error: 'This email is already used by another user' });
    }
    res.status(500).json({ error: err.message });
  }
}

// Admin deletes a user. Their tasks are kept, just unlinked from them.
async function deleteUser(req, res) {
  const id = req.params.id;
  if (!isId(id)) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  let demoted = false;
  try {
    const found = await User.findById(id, 'role').lean();
    if (!found) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Deleting an admin: take the admin role away first, so the "last admin" check is safe
    if (found.role === ROLE_ADMIN) {
      const outcome = await demoteAdmin(id);
      if (outcome === 'last_admin') {
        return res.status(400).json({ error: 'You cannot delete the last admin' });
      }
      demoted = outcome === 'ok';
    }

    // Keep the user's tasks, but unlink them from the user
    await Task.updateMany({ assigned_to: id }, { $set: { assigned_to: null } });
    await Task.updateMany({ created_by: id }, { $set: { created_by: null } });
    const result = await User.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'User not found' }); // deleted in the meantime
    }

    res.json({ message: 'User deleted' });
  } catch (err) {
    if (demoted) await restoreAdmin(id);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getUsers, getUsersRow, createUser, updateUser, deleteUser };
