const mongoose = require('mongoose');

// Turns the search box text into a safe, case-insensitive "contains" search (like SQL LIKE '%text%').
// Characters such as . * ( [ are escaped, so they are matched as plain text.
function containsRegex(text) {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

// True only for a real MongoDB id (24 hex characters)
function isId(value) {
  return mongoose.isObjectIdOrHexString(value);
}

// Turns an id from MongoDB into the plain text the React app uses (or null)
function idText(value) {
  return value ? String(value) : null;
}

module.exports = { containsRegex, isId, idText };
