const db = require('../db');

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

module.exports = { getUsers, getUsersRow };