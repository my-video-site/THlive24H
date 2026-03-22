const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'streamboost-super-secret-key';
const JWT_EXPIRES_IN = '12h';

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = {
  hashPassword,
  signToken,
  verifyToken,
  JWT_SECRET
};
