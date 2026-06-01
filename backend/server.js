require('dotenv').config();
const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const compression = require('compression');
const jwt         = require('jsonwebtoken');
const { sequelize } = require('./models');
const seed = require('./seed');

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

app.get('/', (_req, res) => res.json({ status: 'ok', club: 'New Face Padel Club', version: '2.0.0' }));

app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;

async function migrateReservas() {
  try {
    const qi = sequelize.getQueryInterface();
    const desc = await qi.describeTable('reservas').catch(() => null);
    if (!desc) return;

    if (desc.hora && !desc.hora_inicio) {
      console.log('Migrando columnas de reservas...');
      const q = (sql) => sequelize.query(sql).catch(() => {});
      await q(`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS hora_inicio VARCHAR(5) DEFAULT ''`);
      await q(`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS hora_fin VARCHAR(5) DEFAULT ''`);
      await q(`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS duracion_minutos INTEGER DEFAULT 60`);
      await q(`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS cancha_id INTEGER DEFAULT 1`);
      await q(`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS cliente_nombre VARCHAR(255) DEFAULT ''`);
      await q(`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS cliente_telefono VARCHAR(255) DEFAULT ''`);
      await q(`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS estado_pago VARCHAR(255) DEFAULT 'pendiente'`);
      await q(`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS estado_reserva VARCHAR(255) DEFAULT 'confirmada'`);
      await q(`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS metodo_pago VARCHAR(255) DEFAULT NULL`);
      await q(`UPDATE reservas SET hora_inicio = hora WHERE hora IS NOT NULL AND (hora_inicio IS NULL OR hora_inicio = '')`);
      await q(`UPDATE reservas SET hora_fin = hora WHERE hora IS NOT NULL AND (hora_fin IS NULL OR hora_fin = '')`);
      await q(`UPDATE reservas SET cancha_id = cancha WHERE cancha IS NOT NULL`);
      await q(`UPDATE reservas SET cliente_nombre = nombre WHERE nombre IS NOT NULL AND (cliente_nombre IS NULL OR cliente_nombre = '')`);
      await q(`UPDATE reservas SET cliente_telefono = COALESCE(telefono, '') WHERE cliente_telefono IS NULL OR cliente_telefono = ''`);
      await q(`UPDATE reservas SET estado_pago = COALESCE(estado, 'pendiente') WHERE estado_pago IS NULL OR estado_pago = 'pendiente'`);
      await q(`UPDATE reservas SET metodo_pago = COALESCE("metodoPago", metodo_pago) WHERE "metodoPago" IS NOT NULL`);
      await q(`ALTER TABLE reservas DROP COLUMN IF EXISTS hora`);
      await q(`ALTER TABLE reservas DROP COLUMN IF EXISTS cancha`);
      await q(`ALTER TABLE reservas DROP COLUMN IF EXISTS nombre`);
      await q(`ALTER TABLE reservas DROP COLUMN IF EXISTS telefono`);
      await q(`ALTER TABLE reservas DROP COLUMN IF EXISTS estado`);
      await q(`ALTER TABLE reservas DROP COLUMN IF EXISTS "metodoPago"`);
      await q(`ALTER TABLE reservas DROP COLUMN IF EXISTS "metodoCobro"`);
      console.log('Migracion de reservas completada');
    }
  } catch (err) {
    console.error('Error en migracion de reservas:', err.message);
  }
}

migrateReservas().then(() => sequelize.sync({ alter: true })).then(async () => {
  console.log('PostgreSQL sincronizado');
  await seed();
  const server = app.listen(PORT, () => console.log(`API → puerto ${PORT}`));

  const shutdown = () => {
    console.log('Cerrando servidor...');
    server.close(() => {
      sequelize.close().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}).catch(err => {
  console.error('PostgreSQL error:', err.message);
  process.exit(1);
});
