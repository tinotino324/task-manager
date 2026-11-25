const mongoose = require('mongoose');
const { ROLE_ADMIN, ROLE_USER } = require('../middleware/auth');

// MySQL compared text without caring about upper/lower case. This collation does the same
// in MongoDB, so "Bob@x.com" and "bob@x.com" count as the same email.
const CASE_INSENSITIVE = { locale: 'en', strength: 2 };

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, maxlength: 100 },
    email: { type: String, required: true, maxlength: 150 },
    password_hash: { type: String, required: true },
    role: { type: Number, enum: [ROLE_ADMIN, ROLE_USER], default: ROLE_USER, required: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

userSchema.index({ email: 1 }, { unique: true, collation: CASE_INSENSITIVE });

const User = mongoose.model('User', userSchema);

module.exports = User;
module.exports.CASE_INSENSITIVE = CASE_INSENSITIVE;
