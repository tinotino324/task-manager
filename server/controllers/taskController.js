const db = require('../db');
const { ROLE_ADMIN } = require('../middleware/auth');

// List with search, sort and pagination, filtered by role
async function getTasks(req, res) {
  try {
    const offset = parseInt(req.query.offset) || 0;
    const length = Math.min(parseInt(req.query.length) || 10, 100);
    const keyword = req.query.keyword || '';

    const sortColumns = {
      title: 't.title',
      priority: 't.priority',
      deadline: 't.deadline',
      status: 't.status',
      assigned_name: 'u.name',
      created_name: 'c.name',
      created_at: 't.created_at',
    };
    const orderBy = sortColumns[req.query.order_by] || 't.created_at';
    const order = req.query.order === 'ASC' ? 'ASC' : 'DESC';

    const conditions = [];
    const params = [];

    if (req.user.role !== ROLE_ADMIN) {
      conditions.push('(t.assigned_to = ? OR t.created_by = ?)');
      params.push(req.user.id, req.user.id);
    }

    if (keyword) {
      conditions.push(
        '(t.title LIKE ? OR t.status LIKE ? OR t.priority LIKE ? OR u.name LIKE ? OR c.name LIKE ?)'
      );
      const like = `%${keyword}%`;
      params.push(like, like, like, like, like);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const from = `FROM tasks t
      LEFT JOIN users u ON u.id = t.assigned_to
      LEFT JOIN users c ON c.id = t.created_by`;

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
}

// Counts for the summary cards
async function getTaskStats(req, res) {
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
}

async function createTask(req, res) {
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
}

async function updateTask(req, res) {
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
}

async function deleteTask(req, res) {
  try {
    const [result] = await db.query('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getTasks, getTaskStats, createTask, updateTask, deleteTask };