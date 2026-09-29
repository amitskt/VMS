const jwt = require('jsonwebtoken');

function generateToken({ id, role, email }) {
  return jwt.sign({ id, role, email }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

module.exports = generateToken;
