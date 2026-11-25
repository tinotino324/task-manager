const mongoose = require('mongoose');
const Task = require('../models/Task');
const User = require('../models/User');
const { CASE_INSENSITIVE } = require('../models/User');
const { STATUSES, PRIORITIES } = require('../models/Task');
const { ROLE_ADMIN } = require('../middleware/auth');
const { containsRegex, isId, idText } = require('../utils');

// Non-admins only see tasks they were given or created
function visibleTo(user) {
  if (user.role === ROLE_ADMIN) return {};
  const me = new mongoose.Types.ObjectId(user.id);
  return { $or: [{ assigned_to: me }, { created_by: me }] };
}

// Sends a task back with the same fields the MySQL version had
function toTaskResponse(t) {
  return {
    id: String(t._id),
    title: t.title,
    description: t.description ?? null,
    status: t.status ?? null,
    priority: t.priority ?? null,
    deadline: t.deadline ?? null,
    created_by: idText(t.created_by),
    assigned_to: idText(t.assigned_to),
    created_at: t.created_at,
    assigned_name: t.assigned_name ?? null,
    created_name: t.created_name ?? null,
  };
}

// An admin may only assign a task to a user who exists (MySQL's foreign key used to check this)
async function assigneeExists(assignedTo) {
  if (!assignedTo) return true;
  return isId(assignedTo) && (await User.exists({ _id: assignedTo })) !== null;
}

// List with search, sort and pagination, filtered by role
async function getTasks(req, res) {
  try {
    const offset = parseInt(req.query.offset) || 0;
    const length = Math.min(parseInt(req.query.length) || 10, 100);
    const keyword = req.query.keyword || '';

    // status and priority sort in their natural order (todo, in progress, done), like a MySQL ENUM
    const sortColumns = {
      title: 'title',
      priority: 'priority_rank',
      deadline: 'deadline',
      status: 'status_rank',
      assigned_name: 'assigned_name',
      created_name: 'created_name',
      created_at: 'created_at',
    };
    const orderBy = sortColumns[req.query.order_by] || 'created_at';
    const order = req.query.order === 'ASC' ? 'ASC' : 'DESC';

    const pipeline = [
      { $match: visibleTo(req.user) },
      // Like the SQL LEFT JOINs: fetch the names of the assigned user and the creator
      { $lookup: { from: User.collection.name, localField: 'assigned_to', foreignField: '_id', as: 'assigned' } },
      { $lookup: { from: User.collection.name, localField: 'created_by', foreignField: '_id', as: 'creator' } },
      {
        $addFields: {
          assigned_name: { $ifNull: [{ $arrayElemAt: ['$assigned.name', 0] }, null] },
          created_name: { $ifNull: [{ $arrayElemAt: ['$creator.name', 0] }, null] },
        },
      },
    ];

    if (keyword) {
      const like = containsRegex(keyword);
      pipeline.push({
        $match: {
          $or: [
            { title: like },
            { status: like },
            { priority: like },
            { assigned_name: like },
            { created_name: like },
          ],
        },
      });
    }

    // One query returns both the total count and the current page
    pipeline.push({
      $facet: {
        count: [{ $count: 'total' }],
        rows: [
          {
            $addFields: {
              status_rank: { $indexOfArray: [STATUSES, '$status'] },
              priority_rank: { $indexOfArray: [PRIORITIES, '$priority'] },
            },
          },
          { $sort: { [orderBy]: order === 'ASC' ? 1 : -1, _id: -1 } },
          { $skip: offset },
          { $limit: length },
        ],
      },
    });

    const [result] = await Task.aggregate(pipeline).collation(CASE_INSENSITIVE);
    const tasks = result.rows.map(toTaskResponse);

    res.json({
      status: true,
      total_counts: result.count[0]?.total || 0,
      listing_counts: tasks.length,
      tasks,
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
    const countStatus = (status) => ({ $sum: { $cond: [{ $eq: ['$status', status] }, 1, 0] } });
    const [r] = await Task.aggregate([
      { $match: visibleTo(req.user) },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          todo: countStatus('todo'),
          in_progress: countStatus('in_progress'),
          done: countStatus('done'),
        },
      },
    ]);
    res.json({
      total: r?.total || 0,
      todo: r?.todo || 0,
      in_progress: r?.in_progress || 0,
      done: r?.done || 0,
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
    if (!(await assigneeExists(assignedTo))) {
      return res.status(400).json({ error: 'Assigned user not found' });
    }

    const task = await Task.create({
      title,
      description: description || null,
      priority: priority || 'medium',
      deadline: deadline || null,
      created_by: req.user.id,
      assigned_to: assignedTo,
    });
    res.status(201).json({ id: String(task._id), message: 'Task created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateTask(req, res) {
  try {
    if (!isId(req.params.id)) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const { title, description, status, priority, deadline, assigned_to } = req.body;
    let result;

    if (req.user.role === ROLE_ADMIN) {
      if (!(await assigneeExists(assigned_to || null))) {
        return res.status(400).json({ error: 'Assigned user not found' });
      }
      // Like the SQL UPDATE, every field is replaced. A missing title fails the "required" check.
      result = await Task.updateOne(
        { _id: req.params.id },
        {
          $set: {
            title: title ?? null,
            description: description || null,
            status: status ?? null,
            priority: priority ?? null,
            deadline: deadline || null,
            assigned_to: assigned_to || null,
          },
        },
        { runValidators: true }
      );
    } else {
      result = await Task.updateOne(
        { _id: req.params.id, ...visibleTo(req.user) },
        { $set: { status: status ?? null } },
        { runValidators: true }
      );
    }

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json({ message: 'Task updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function deleteTask(req, res) {
  try {
    if (!isId(req.params.id)) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const result = await Task.deleteOne({ _id: req.params.id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getTasks, getTaskStats, createTask, updateTask, deleteTask };
