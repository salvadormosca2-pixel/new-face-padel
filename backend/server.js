require('dotenv').config();
const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const compression = require('compression');
const mongoose    = require('mongoose');
const jwt         = require('jsonwebtoken');

const app = express();

app.use(helmet());
app.use(compression());

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

app.use(express.json({ limit: '1mb' }));

app.use('/api/admin', (req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
});

app.use('/', require('./routes/auth'));
app.use('/', require('./routes/reservas'));
app.use('/', require('./routes/torneos'));
app.use('/', require('./routes/profesores'));
app.use('/', require('./routes/socios'));
app.use('/', require('./routes/ingresos'));
app.use('/', require('./routes/club'));
app.use('/', require('./routes/premios'));
app.use('/', require('./routes/bot'));

app.get('/', (_req, res) => res.json({ status: 'ok', club: 'New Face Padel Club', version: '1.0.0' }));

app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;

mongoose.connect(process.env.MONGODB_URI, {
  maxPoolSize: 5,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
}).then(() => {
  console.log('MongoDB conectado');
  const server = app.listen(PORT, () => console.log(`API → puerto ${PORT}`));

  const shutdown = () => {
    console.log('Cerrando servidor...');
    server.close(() => {
      mongoose.connection.close(false).then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}).catch(err => {
  console.error('MongoDB error:', err.message);
  process.exit(1);
});
