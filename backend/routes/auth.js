const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_PASS = process.env.ADMIN_PASSWORD;

if (!JWT_SECRET || !ADMIN_PASS) {
  console.error('FATAL: JWT_SECRET y ADMIN_PASSWORD deben estar definidos');
  process.exit(1);
}

const loginAttempts = new Map();
const RATE_WINDOW  = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (now - entry.start > RATE_WINDOW) loginAttempts.delete(ip);
  }
}, 5 * 60 * 1000);

router.post('/api/auth/login', (req, res) => {
  try {
    const ip  = req.ip;
    const now = Date.now();
    const entry = loginAttempts.get(ip);

    if (entry && now - entry.start < RATE_WINDOW && entry.count >= MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Demasiados intentos, esperá 15 minutos' });
    }

    if (!entry || now - entry.start > RATE_WINDOW) {
      loginAttempts.set(ip, { start: now, count: 1 });
    } else {
      entry.count++;
    }

    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Contraseña requerida' });

    const passBuffer  = Buffer.from(String(password));
    const adminBuffer = Buffer.from(ADMIN_PASS);
    const match = passBuffer.length === adminBuffer.length && crypto.timingSafeEqual(passBuffer, adminBuffer);

    if (!match) return res.status(401).json({ error: 'Contraseña incorrecta' });

    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '365d' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

router.get('/api/auth/verify', (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ valid: false });
    jwt.verify(token, JWT_SECRET);
    res.json({ valid: true });
  } catch {
    res.status(401).json({ valid: false });
  }
});

router.post('/api/auth/logout', (_req, res) => res.json({ ok: true }));

module.exports = router;
