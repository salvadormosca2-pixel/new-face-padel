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

require('./routes')
  .forEach(nombre => app.use('/', require('./routes/' + nombre)));

app.get('/', (_req, res) => res.json({ status: 'ok', club: 'New Face Padel Club', version: '3.0.0' }));

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

/*
  Las reservas que ya estaban cobradas no tienen fila en pagos: sin esto la caja
  arrancaria en cero y se perderia el historial de efectivo/transferencia.
*/
/* Por si el ALTER dejó nulos en las columnas nuevas de reservas ya cargadas. */
/*
  Una mesa no puede tener dos cuentas abiertas. Sequelize no sabe expresar un
  índice parcial, así que va a mano: sin esto dos mozos abren la misma mesa dos
  veces y la mitad del consumo queda en una cuenta que nadie cobra.
*/
async function indiceCuentaUnica() {
  try {
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS cuentas_una_abierta_por_mesa
       ON cuentas ("mesaId") WHERE estado = 'abierta'`
    );
  } catch (err) {
    console.error('Indice de cuentas abiertas:', err.message);
  }
}

async function rellenarCamposNuevos() {
  const q = (sql) => sequelize.query(sql).catch(err => console.error('Backfill:', err.message));
  await q(`UPDATE reservas SET origen     = 'mostrador' WHERE origen IS NULL`);
  await q(`UPDATE reservas SET asistencia = 'pendiente' WHERE asistencia IS NULL`);
  await q(`UPDATE reservas SET deporte    = COALESCE((SELECT e.deporte FROM espacios e WHERE e.id = reservas.cancha_id), 'padel') WHERE deporte IS NULL`);
}

async function migrarPagosHistoricos() {
  try {
    const [pendiente] = await sequelize.query(`
      SELECT COUNT(*)::int AS n FROM reservas r
      WHERE r.estado_pago = 'pagado' AND r.monto > 0
        AND NOT EXISTS (SELECT 1 FROM pagos p WHERE p."reservaId" = r.id)
    `);
    const cuantas = pendiente?.[0]?.n || 0;
    if (cuantas === 0) return;

    await sequelize.query(`
      INSERT INTO pagos ("reservaId", pagador, monto, metodo, concepto, fecha,
                         "usuarioId", "usuarioNombre", anulado, nota, "createdAt", "updatedAt")
      SELECT r.id, r.cliente_nombre, r.monto,
             CASE WHEN r.metodo_pago IN ('efectivo','transferencia','mercadopago','tarjeta')
                  THEN r.metodo_pago ELSE 'efectivo' END,
             'cancha', r.fecha, NULL, 'Migración', false,
             'Cobro anterior al sistema de caja', NOW(), NOW()
      FROM reservas r
      WHERE r.estado_pago = 'pagado' AND r.monto > 0
        AND NOT EXISTS (SELECT 1 FROM pagos p WHERE p."reservaId" = r.id)
    `);
    console.log(`Migracion: ${cuantas} cobro(s) historico(s) cargados en la caja`);
  } catch (err) {
    console.error('Error migrando pagos historicos:', err.message);
  }
}

migrateReservas().then(() => sequelize.sync({ alter: true })).then(rellenarCamposNuevos).then(indiceCuentaUnica).then(migrarPagosHistoricos).then(async () => {
  console.log('PostgreSQL sincronizado');
  await seed();

  /* Los turnos fijos se materializan al arrancar y una vez por día */
  const { extenderTodos } = require('./lib/fijos');
  await extenderTodos();
  setInterval(extenderTodos, 24 * 60 * 60 * 1000).unref?.();
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
