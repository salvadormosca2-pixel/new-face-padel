require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const mongoose = require('mongoose');

const app = express();

// ─── CORS ──────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.FRONTEND_URL || '*').split(',').map(s => s.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error('CORS: origen no permitido'));
  },
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: true
}));
app.options('*', cors());
app.use(express.json());

// ─── RUTAS ─────────────────────────────────────────────────────────────────
app.use('/', require('./routes/reservas'));
app.use('/', require('./routes/torneos'));
app.use('/', require('./routes/profesores'));
app.use('/', require('./routes/socios'));
app.use('/', require('./routes/ingresos'));

// Health check
app.get('/', (_req, res) => res.json({ status: 'ok', club: 'New Face Padel Club', version: '1.0.0' }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ─── INICIAR ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB conectado');
    app.listen(PORT, () => console.log(`🎾 New Face Padel Club API → puerto ${PORT}`));
  })
  .catch(err => { console.error('❌ MongoDB error:', err.message); process.exit(1); });
