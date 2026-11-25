const bcrypt = require('bcryptjs');
const db = require('../db');
const { ROLE_ADMIN, ROLE_USER } = require('../middleware/auth');

async function getUsersRow(req, res) {
  try {
    const [rows] = await db.query('SELECT id, name, email, role FROM users ORDER BY name');
    res.json(rows, ['1']);
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
    const conditions  = [];
    const params      = [];

    if (keyword) 
    {
        conditions.push(
          '(name LIKE ? OR email LIKE ? OR role LIKE ?)'
        );
        const like = `%${keyword}%`;
        params.push(like, like, like);
    }

    const where       = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const from        = `FROM users`;
    const [countRows] = await db.query(`SELECT COUNT(*) AS total_count ${from} ${where}`, params);

    const [rows] = await db.query(
      `SELECT id, name, email, role ${from} ${where}
       ORDER BY ${orderBy} ${order}, id DESC LIMIT ? OFFSET ?`,
      [...params, length, offset]
    );

    res.json({
      status: true,
      total_counts: countRows[0].total_count,
      listing_counts: rows.length,
      tasks: rows,
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
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'This email is already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, passwordHash, role]
    );

    // Send back only safe fields, never the password hash
    res.status(201).json({
      message: 'User created',
      user: { id: result.insertId, name, email, role },
    });
  } catch (err) {
    // Two admins adding the same email at the same moment: the UNIQUE column catches it
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'This email is already registered' });
    }
    res.status(500).json({ error: err.message });
  }
}

// Admin edits a user. The password only changes when a new one is sent.
async function updateUser(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
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

  // A transaction with row locks, so two admins saving at the same time
  // cannot both pass the "last admin" check
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [found] = await conn.query('SELECT id, role FROM users WHERE id = ? FOR UPDATE', [id]);
    if (found.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'User not found' });
    }

    const [sameEmail] = await conn.query('SELECT id FROM users WHERE email = ? AND id <> ?', [email, id]);
    if (sameEmail.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'This email is already used by another user' });
    }

    // Turning an admin into a normal user: make sure another admin is left
    if (found[0].role === ROLE_ADMIN && role !== ROLE_ADMIN) {
      const [admins] = await conn.query('SELECT id FROM users WHERE role = ? FOR UPDATE', [ROLE_ADMIN]);
      if (admins.length <= 1) {
        await conn.rollback();
        return res.status(400).json({ error: 'You cannot remove the last admin. Make another user an admin first.' });
      }
    }

    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      await conn.query(
        'UPDATE users SET name = ?, email = ?, role = ?, password_hash = ? WHERE id = ?',
        [name, email, role, passwordHash, id]
      );
    } else {
      await conn.query('UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?', [name, email, role, id]);
    }

    await conn.commit();
    res.json({ message: 'User updated', user: { id, name, email, role } });
  } catch (err) {
    await conn.rollback().catch(() => {});
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'This email is already used by another user' });
    }
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
}

// Admin deletes a user. Their tasks are kept, just unlinked from them.
async function deleteUser(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [found] = await conn.query('SELECT id, role FROM users WHERE id = ? FOR UPDATE', [id]);
    if (found.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'User not found' });
    }

    if (found[0].role === ROLE_ADMIN) {
      const [admins] = await conn.query('SELECT id FROM users WHERE role = ? FOR UPDATE', [ROLE_ADMIN]);
      if (admins.length <= 1) {
        await conn.rollback();
        return res.status(400).json({ error: 'You cannot delete the last admin' });
      }
    }

    // Unlink the user's tasks first, otherwise the foreign keys block the delete
    await conn.query('UPDATE tasks SET assigned_to = NULL WHERE assigned_to = ?', [id]);
    await conn.query('UPDATE tasks SET created_by = NULL WHERE created_by = ?', [id]);
    await conn.query('DELETE FROM users WHERE id = ?', [id]);

    await conn.commit();
    res.json({ message: 'User deleted' });
  } catch (err) {
    await conn.rollback().catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
}

module.exports = { getUsers, getUsersRow, createUser, updateUser, deleteUser };