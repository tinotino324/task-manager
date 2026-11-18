const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const db = require('./db');

const ROLE_ADMIN = 1;
const ROLE_USER = 2;

const app = express();
app.use(cors());
app.use(express.json());

// ---------- AUTH ----------

// REGISTER: every new account is a normal user (role 2)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    if (password.length < 4 ) {
      return res.status(400).json({ error: 'Password must be at least 5 characters' });
    }
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'This email is already registered' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, passwordHash, ROLE_USER]
    );
    res.status(201).json({ id: result.insertId, message: 'Account created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// LOGIN: the token carries the user's id, name and role
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign(
      { id: user.id, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- MIDDLEWARE ----------

// Checks the token and puts the user in req.user
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
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

// ---------- USERS ----------

// List of users for the "assign to" dropdown (admin only)
app.get('/api/users', auth, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, name, email, role FROM users ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- TASKS ----------

app.use('/api/tasks', auth); // every task route needs a login

// LIST: search, sort and pagination, filtered by role
app.get('/api/tasks', async (req, res) => {
  try {
    const offset  = parseInt(req.query.offset) || 0;
    const length  = Math.min(parseInt(req.query.length) || 10, 100);
    const keyword = req.query.keyword || '';

    // Sortable columns: name sent by React -> real column
    const sortColumns = {
      title: 't.title',
      priority: 't.priority',
      deadline: 't.deadline',
      status: 't.status',
      assigned_name: 'u.name',
      created_at: 't.created_at',
    };
    const orderBy     = sortColumns[req.query.order_by] || 't.created_at';
    const order       = req.query.order === 'ASC' ? 'ASC' : 'DESC';
    const conditions  = [];
    const params      = [];

    // Normal users see only their own tasks
    if (req.user.role !== ROLE_ADMIN) {
      conditions.push('(t.assigned_to = ? OR t.created_by = ?)');
      params.push(req.user.id, req.user.id);
    }

    if (keyword) {
      conditions.push('(t.title LIKE ? OR t.status LIKE ? OR t.priority LIKE ? OR u.name LIKE ?)');
      const like = `%${keyword}%`;
      params.push(like, like, like, like);
    }

    const where       = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const from        = `FROM tasks t  LEFT JOIN users u ON u.id = t.assigned_to LEFT JOIN users c ON c.id = t.created_by`;
    const [countRows] = await db.query(`SELECT COUNT(*) AS total_count ${from} ${where}`, params);

    const [rows] = await db.query(
      `SELECT t.*, u.name AS assigned_name, c.name AS created_name ${from} ${where}
       ORDER BY ${orderBy} ${order}, t.id DESC LIMIT ? OFFSET ?`,
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
});

// COUNTS for the summary cards, filtered by role
app.get('/api/tasks/stats', async (req, res) => {
  try {
    let where = '';
    const params = [];
    if (req.user.role !== ROLE_ADMIN) {
      where = 'WHERE assigned_to = ? OR created_by = ?';
      params.push(req.user.id, req.user.id);
    }
    const [rows] = await db.query(
      `SELECT COUNT(*) AS total,
              SUM(status = 'todo') AS todo,
              SUM(status = 'in_progress') AS in_progress,
              SUM(status = 'done') AS done
       FROM tasks ${where}`,
      params
    );
    const r = rows[0];
    res.json({
      total: Number(r.total),
      todo: Number(r.todo),
      in_progress: Number(r.in_progress),
      done: Number(r.done),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE: admin chooses the assignee, a normal user gets the task themselves
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, description, priority, deadline, assigned_to } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    const assignedTo = req.user.role === ROLE_ADMIN ? assigned_to || null : req.user.id;

    const [result] = await db.query(
      `INSERT INTO tasks (title, description, priority, deadline, created_by, assigned_to)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [title, description || null, priority || 'medium', deadline || null, req.user.id, assignedTo]
    );
    res.status(201).json({ id: result.insertId, message: 'Task created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE: admin can change everything, a normal user only the status of their own tasks
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const { title, description, status, priority, deadline, assigned_to } = req.body;
    let result;

    if (req.user.role === ROLE_ADMIN) {
      [result] = await db.query(
        `UPDATE tasks
         SET title = ?, description = ?, status = ?, priority = ?, deadline = ?, assigned_to = ?
         WHERE id = ?`,
        [title, description || null, status, priority, deadline || null, assigned_to || null, req.params.id]
      );
    } else {
      [result] = await db.query(
        'UPDATE tasks SET status = ? WHERE id = ? AND (assigned_to = ? OR created_by = ?)',
        [status, req.params.id, req.user.id, req.user.id]
      );
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json({ message: 'Task updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE: admin only
app.delete('/api/tasks/:id', adminOnly, async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});