const mongoose = require('mongoose');

const STATUSES = ['todo', 'in_progress', 'done'];
const PRIORITIES = ['low', 'medium', 'high'];

// The deadline is kept as plain "YYYY-MM-DD" text (like a MySQL DATE), so no timezone can shift it
function isDateString(value) {
  if (value == null) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !isNaN(date) && date.toISOString().slice(0, 10) === value; // rejects 2026-02-30
}

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, default: null },
    status: { type: String, enum: STATUSES, default: 'todo' },
    priority: { type: String, enum: PRIORITIES, default: 'medium' },
    deadline: {
      type: String,
      default: null,
      validate: { validator: isDateString, message: 'Deadline must be a date in YYYY-MM-DD format' },
    },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// Non-admins only see tasks they created or were given, so these lookups need to be fast
taskSchema.index({ assigned_to: 1 });
taskSchema.index({ created_by: 1 });

const Task = mongoose.model('Task', taskSchema);

module.exports = Task;
module.exports.STATUSES = STATUSES;
module.exports.PRIORITIES = PRIORITIES;
