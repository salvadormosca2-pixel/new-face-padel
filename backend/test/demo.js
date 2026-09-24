/*
  Demo local del club, para ver el panel andando sin tocar producción.

    npm run demo   →  http://localhost:4000/admin2.html

  Levanta el backend real (mismas rutas, mismos modelos) contra un Postgres en
  memoria, lo llena con un viernes a la noche típico y sirve el frontend al lado.
*/
const { newDb } = require('pg-mem');

const db = newDb();

/* pg-mem no trae esta función; el seed la usa para acomodar la secuencia de ids. */
const { DataType } = require('pg-mem');
db.public.registerFunction({
  name: 'pg_get_serial_sequence',
  args: [DataType.text, DataType.text],
  returns: DataType.text,
  implementation: (tabla) => `${tabla}_id_seq`
});
db.public.registerFunction({
  name: 'setval',
  args: [DataType.text, DataType.integer, DataType.bool],
  returns: DataType.integer,
  implementation: (_seq, valor) => valor
});

const pgPath = require.resolve('pg');
require.cache[pgPath] = { id: pgPath, filename: pgPath, loaded: true, exports: db.adapters.createPg() };

const { Sequelize } = require('sequelize');
const sequelize = new Sequelize('postgres://demo:demo@localhost:5432/demo', { dialect: 'postgres', logging: false });
const dbPath = require.resolve('../db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: sequelize };

process.env.JWT_SECRET     = process.env.JWT_SECRET     || 'demo-secret-local-no-usar-en-produccion';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'demo';
process.env.CLUB_TZ        = process.env.CLUB_TZ        || 'America/Argentina/Buenos_Aires';

const express = require('express');
const path    = require('path');
const jwt     = require('jsonwebtoken');
const models  = require('../models');
const { hoyClub } = require('../lib/fechas');
const { seedEspacios, seedProductos, seedMesas } = require('../lib/seed-nuevos');

const PORT  = parseInt(process.env.DEMO_PORT) || 4000;
const FRONT = path.join(__dirname, '..', '..', 'frontend');

const PERSONAL = [
  { nombre: 'Salvador', rol: 'dueno',    pin: '1111', color: '#f59e0b' },
  { nombre: 'Nacho',    rol: 'jefe',     pin: '2222', color: '#3b82f6' },
  { nombre: 'Lucas',    rol: 'empleado', pin: '3333', color: '#22c55e' },
];

async function sembrarDemo() {
  const hoy = hoyClub();
  await seedEspacios();
  await seedProductos();
  await seedMesas();

  const usuarios = {};
  for (const p of PERSONAL) {
    const u = await models.Usuario.create({
      nombre: p.nombre, rol: p.rol, color: p.color, pinHash: models.Usuario.hashPin(p.pin)
    });
    usuarios[p.nombre] = u;
  }

  await models.Profesor.bulkCreate([
    { nombre: 'Seba Bursi',           especialidad: 'Profe de pádel y amante del aire libre', experiencia: 'Academia New Face', horarios: 'Consultá por WhatsApp', whatsapp: '5493834351935', alumnos: 60, rating: 5, niveles: ['Principiante', 'Intermedio', 'Avanzado'], gruposEdad: ['Niños', 'Adultos'] },
    { nombre: 'Valeria Sánchez Ruiz', especialidad: 'La profe',                                experiencia: 'Academia New Face', horarios: 'Consultá por WhatsApp', whatsapp: '5493834351935', alumnos: 55, rating: 5, niveles: ['Principiante', 'Intermedio'], gruposEdad: ['Niños', 'Adultos'] },
    { nombre: 'Seba López Acuña',     especialidad: 'Un grande',                               experiencia: 'Academia New Face', horarios: 'Consultá por WhatsApp', whatsapp: '5493834351935', alumnos: 45, rating: 5, niveles: ['Intermedio', 'Avanzado'], gruposEdad: ['Adultos'] },
    { nombre: 'Mario Galletti',       especialidad: 'El profe',                                experiencia: 'Academia New Face', horarios: 'Consultá por WhatsApp', whatsapp: '5493834351935', alumnos: 40, rating: 5, niveles: ['Principiante', 'Intermedio', 'Avanzado'], gruposEdad: ['Adultos'] }
  ]);

  /* Un viernes a la noche: cada turno entró por un lado distinto */
  const turnos = [
    { cancha: 3, ini: '19:00', dur: 90, cliente: 'Salvador Mosca',  origen: 'whatsapp', tel: '1145678901', por: 'Lucas' },
    { cancha: 1, ini: '20:00', dur: 60, cliente: 'Grupo iniciación', origen: 'profesor', profe: 1, por: 'Nacho' },
    { cancha: 2, ini: '18:00', dur: 60, cliente: 'Roberto Díaz',    origen: 'online',   tel: '1189012345', falta: true, por: 'Web' },
    { cancha: 3, ini: '21:00', dur: 90, cliente: 'Los del jueves',  origen: 'fijo',     por: 'Nacho' },
    { cancha: 1, ini: '17:00', dur: 60, cliente: 'Martín Gómez',    origen: 'mostrador', tel: '1145670123', por: 'Lucas' },
    { cancha: 2, ini: '15:00', dur: 120, cliente: 'Arreglo de luz', origen: 'bloqueo',  por: 'Nacho' },
    { cancha: 5, ini: '18:30', dur: 30, cliente: 'Juan (ping pong)', origen: 'mostrador', por: 'Lucas' },
    { cancha: 7, ini: '19:00', dur: 60, cliente: 'Pickle novatos',  origen: 'whatsapp', por: 'Lucas' },
    { cancha: 8, ini: '20:00', dur: 90, cliente: 'Beach mixto',     origen: 'online',   por: 'Web' },
  ];

  const espacios = await models.Espacio.findAll({ raw: true });
  const creadas = {};

  for (const [i, t] of turnos.entries()) {
    const esp = espacios.find(e => e.id === t.cancha);
    const [h, m] = t.ini.split(':').map(Number);
    const fin = `${String(Math.floor((h * 60 + m + t.dur) / 60) % 24).padStart(2, '0')}:${String((h * 60 + m + t.dur) % 60).padStart(2, '0')}`;
    const r = await models.Reserva.create({
      fecha: hoy, hora_inicio: t.ini, hora_fin: fin, duracion_minutos: t.dur,
      cancha_id: t.cancha, deporte: esp.deporte,
      cliente_nombre: t.cliente, cliente_telefono: t.tel || '',
      monto: t.origen === 'bloqueo' ? 0 : Math.round(esp.precioHora * t.dur / 60),
      claveUnica: 'demo-' + i, origen: t.origen,
      profesor_id: t.profe || null,
      profesor_nombre: t.profe === 1 ? 'Seba Bursi' : '',
      asistencia: t.falta ? 'falta' : 'pendiente',
      creado_por: t.por, creado_por_id: usuarios[t.por]?.id || null
    });
    creadas[t.cliente] = r;
  }

  /* El turno de Salvador: consumiciones cargadas y pagado a medias */
  const turnoSalva = creadas['Salvador Mosca'];
  const agua  = await models.Producto.findOne({ where: { nombre: 'Agua 500ml' } });
  const sandw = await models.Producto.findOne({ where: { nombre: 'Sándwich' } });

  await models.Consumicion.create({
    reservaId: turnoSalva.id, productoId: agua.id, nombre: agua.nombre, emoji: agua.emoji,
    cantidad: 2, precioUnitario: agua.precio, total: agua.precio * 2,
    fecha: hoy, usuarioId: usuarios.Lucas.id, usuarioNombre: 'Lucas'
  });
  await agua.update({ stock: agua.stock - 2 });
  await models.Consumicion.create({
    reservaId: turnoSalva.id, productoId: sandw.id, nombre: sandw.nombre, emoji: sandw.emoji,
    cantidad: 1, precioUnitario: sandw.precio, total: sandw.precio,
    fecha: hoy, usuarioId: usuarios.Lucas.id, usuarioNombre: 'Lucas'
  });
  await sandw.update({ stock: sandw.stock - 1 });
  await models.Pago.create({
    reservaId: turnoSalva.id, pagador: 'Salvador', monto: 7000, metodo: 'efectivo',
    concepto: 'mixto', fecha: hoy, usuarioId: usuarios.Lucas.id, usuarioNombre: 'Lucas'
  });

  /* La clase quedó cobrada por transferencia */
  await models.Pago.create({
    reservaId: creadas['Grupo iniciación'].id, pagador: 'Valentina', monto: 5000, metodo: 'transferencia',
    concepto: 'cancha', fecha: hoy, usuarioId: usuarios.Nacho.id, usuarioNombre: 'Nacho'
  });

  const { recalcularEstadoPago } = require('../lib/cuentas');
  await recalcularEstadoPago(turnoSalva.id);
  await recalcularEstadoPago(creadas['Grupo iniciación'].id);

  /* Dos turnos fijos, uno de un grupo y otro de una profesora */
  const { generarReservas } = require('../lib/fijos');
  const fijos = await models.TurnoFijo.bulkCreate([
    {
      tipo: 'persona', cliente_nombre: 'Los del jueves', cliente_telefono: '1145678901',
      cancha_id: 2, deporte: 'padel', dias: [2, 4], hora_inicio: '20:00', duracion_minutos: 90,
      desde: hoy, activo: true, creado_por_id: usuarios.Nacho.id, creado_por: 'Nacho'
    },
    {
      tipo: 'profesor', cliente_nombre: 'Seba Bursi', profesor_id: 1, profesor_nombre: 'Seba Bursi',
      cancha_id: 1, deporte: 'padel', dias: [1, 3, 5], hora_inicio: '18:00', duracion_minutos: 60,
      desde: hoy, activo: true, creado_por_id: usuarios.Nacho.id, creado_por: 'Nacho'
    }
  ]);
  for (const f of fijos) await generarReservas(f.toJSON());

  /* Algo de auditoría para que la pantalla no arranque vacía */
  const { auditar } = require('../lib/permisos');
  await auditar(usuarios.Lucas, { accion: 'reserva.crear', entidad: 'reserva', entidadId: turnoSalva.id,
    descripcion: 'Cargó Cancha 3 19:00-20:30 · Salvador Mosca (WhatsApp)', monto: 6000, fecha: hoy });
  await auditar(usuarios.Lucas, { accion: 'consumicion.crear', entidad: 'reserva', entidadId: turnoSalva.id,
    descripcion: 'Cargó 2× Agua 500ml, 1× Sándwich a Salvador Mosca', monto: 7500, fecha: hoy });
  await auditar(usuarios.Lucas, { accion: 'cobro.registrar', entidad: 'pago', entidadId: 1,
    descripcion: 'Cobró $7000 en Efectivo de Salvador — turno ' + hoy + ' 19:00', monto: 7000, fecha: hoy });
  await auditar(usuarios.Nacho, { accion: 'cobro.registrar', entidad: 'pago', entidadId: 2,
    descripcion: 'Cobró $5000 en Transferencia de Valentina — clase de las 20:00', monto: 5000, fecha: hoy });
  await auditar(usuarios.Nacho, { accion: 'reserva.asistencia', entidad: 'reserva', entidadId: creadas['Roberto Díaz'].id,
    descripcion: 'Marcó FALTA de Roberto Díaz (' + hoy + ' 18:00)', fecha: hoy, detalle: { asistencia: 'falta' } });
}

async function main() {
  await sequelize.sync();
  await sembrarDemo();

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/admin', (req, res, next) => {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token requerido' });
    try { jwt.verify(token, process.env.JWT_SECRET); next(); }
    catch { res.status(401).json({ error: 'Token inválido o expirado' }); }
  });

  require('../routes')
    .forEach(nombre => app.use('/', require('../routes/' + nombre)));

  /* El frontend tiene que apuntar acá, no a Railway */
  app.get('/js/config.js', (_req, res) => {
    res.type('application/javascript')
       .send(`window.__API_URL__ = '';\nwindow.__DEMO_MODE__ = false;\n`);
  });
  app.use(express.static(FRONT));

  app.listen(PORT, () => {
    console.log(`\n  Demo del club → http://localhost:${PORT}/admin2.html`);
    console.log(`  Contraseña del panel: ${process.env.ADMIN_PASSWORD}`);
    console.log('  PINs:  Salvador (dueño) 1111 · Nacho (jefe) 2222 · Lucas (empleado) 3333\n');
  });
}

main().catch(e => { console.error('Demo:', e.message); process.exit(1); });
