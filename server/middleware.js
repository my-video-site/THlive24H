const path = require('path');
const fs = require('fs/promises');
const { verifyToken } = require('./auth');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');

const rateBuckets = new Map();
const blockedIps = new Set();

function sanitizeValue(value) {
  if (typeof value === 'string') {
    return value.replace(/[<>]/g, '').trim();
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, sanitizeValue(nestedValue)])
    );
  }

  return value;
}

function sanitizeInput(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body);
  }

  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeValue(req.query);
  }

  next();
}

function rateLimit({ windowMs = 60000, max = 120, blockAfter = 300 } = {}) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';

    if (blockedIps.has(ip)) {
      return res.status(429).json({ error: 'IP blocked due to suspicious activity.' });
    }

    const now = Date.now();
    const bucket = rateBuckets.get(ip) || { count: 0, start: now };

    if (now - bucket.start > windowMs) {
      bucket.count = 0;
      bucket.start = now;
    }

    bucket.count += 1;
    rateBuckets.set(ip, bucket);

    if (bucket.count > blockAfter) {
      blockedIps.add(ip);
      return res.status(429).json({ error: 'Too many requests. IP blocked.' });
    }

    if (bucket.count > max) {
      return res.status(429).json({ error: 'Rate limit exceeded.' });
    }

    next();
  };
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [, token] = authHeader.split(' ');

  if (!token) {
    return res.status(401).json({ error: 'Missing token.' });
  }

  try {
    req.user = verifyToken(token);
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token.' });
  }
}

async function logEvent(type, payload = {}) {
  try {
    const raw = await fs.readFile(LOGS_FILE, 'utf8');
    const logs = JSON.parse(raw);
    logs.events.unshift({
      id: `${type}-${Date.now()}`,
      type,
      payload,
      createdAt: new Date().toISOString()
    });
    logs.events = logs.events.slice(0, 500);
    await fs.writeFile(LOGS_FILE, JSON.stringify(logs, null, 2));
  } catch (error) {
    console.error('Failed to write log event:', error.message);
  }
}

module.exports = {
  sanitizeInput,
  rateLimit,
  requireAuth,
  logEvent
};
