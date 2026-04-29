const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'padelpro-secret-local';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'newface2026';

// POST /api/auth/login
router.post('/api/auth/login', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Contraseña requerida' });
    const ok = await bcrypt.compare(password, await bcrypt.hash(ADMIN_PASS, 10))
      .then(() => password === ADMIN_PASS);
    if (!ok) return res.status(401).json({ error: 'Contraseña incorrecta' });
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '365d' });
    res.json({ token });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/auth/verify
router.get('/api/auth/verify', (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.replace('Bearer ', '');
    if (!token) return res.status(401).json({ valid: false });
    jwt.verify(token, JWT_SECRET);
    res.json({ valid: true });
  } catch { res.status(401).json({ valid: false }); }
});

// POST /api/auth/logout  (el token se elimina en el cliente)
router.post('/api/auth/logout', (_req, res) => res.json({ ok: true }));

module.exports = router;
