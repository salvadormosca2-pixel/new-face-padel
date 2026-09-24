const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const Reserva  = require('../models/Reserva');
const Socio    = require('../models/Socio');
const Profesor = require('../models/Profesor');
const Consumicion = require('../models/Consumicion');
const Pago = require('../models/Pago');
const {
  DEPORTES, DEPORTES_VALIDOS, ORIGENES, ORIGENES_VALIDOS, ORIGENES_NO_FACTURABLES,
  getEspacios, getEspacio, aFormaLegacy
} = require('../lib/espacios');
const { autorizar, auditar, responderError, hoyStr } = require('../lib/permisos');
const { cuentaDeReserva } = require('../lib/cuentas');

const HORA_APERTURA = '15:00';
const HORA_CIERRE   = '00:00';

function timeToMin(t) { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; }
function minToTime(m) { const h = Math.floor(m / 60) % 24; return String(h).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
function cierreMin() { const c = timeToMin(HORA_CIERRE); return c <= timeToMin(HORA_APERTURA) ? c + 1440 : c; }

function chocan(r, espacioId, fecha, inicioMin, finMin) {
  if (r.cancha_id !== espacioId || r.fecha !== fecha || r.estado_reserva === 'cancelada') return false;
  const rInicio = timeToMin(r.hora_inicio);
  const rFin    = timeToMin(r.hora_fin);
  const rFinAdj = rFin <= rInicio ? rFin + 1440 : rFin;
  const finAdj  = finMin <= inicioMin ? finMin + 1440 : finMin;
  return rInicio < finAdj && rFinAdj > inicioMin;
}

async function getReservasDia(fecha) {
  return Reserva.findAll({ where: { fecha, estado_reserva: 'confirmada' }, raw: true });
}

/*
  Un hueco menor al turno minimo de ese espacio no lo alquila nadie: no se ofrece.
  El minimo sale del espacio (padel 60', tenis de mesa 30').
*/
function creaHuecoMuerto(reservas, espacioId, fecha, slotStart, slotEnd, minTurno) {
  const ocupados = reservas
    .filter(r => r.cancha_id === espacioId && r.fecha === fecha && r.estado_reserva !== 'cancelada')
    .map(r => {
      let s = timeToMin(r.hora_inicio);
      let e = timeToMin(r.hora_fin);
      if (e <= s) e += 1440;
      return { start: s, end: e };
    })
    .sort((a, b) => a.start - b.start);

  if (ocupados.length === 0) return false;

  let prevEnd = null;
  for (const r of ocupados) if (r.end <= slotStart) prevEnd = r.end;
  if (prevEnd !== null) {
    const gapBefore = slotStart - prevEnd;
    if (gapBefore > 0 && gapBefore < minTurno) return true;
  }

  let nextStart = null;
  for (const r of ocupados) if (r.start >= slotEnd) { nextStart = r.start; break; }
  if (nextStart !== null) {
    const gapAfter = nextStart - slotEnd;
    if (gapAfter > 0 && gapAfter < minTurno) return true;
  }

  return false;
}

/*
  Disponibilidad por deporte. Cada espacio camina con su propio paso y su propio
  turno minimo, asi una mesa de ping pong puede ofrecer bloques de 30'.
*/
async function calcDisponibilidad(fecha, duracionMinutos, deporte = 'padel') {
  const espacios = await getEspacios({ deporte });
  if (espacios.length === 0) return [];

  const reservas = await getReservasDia(fecha);
  const apertura = timeToMin(HORA_APERTURA);
  const cierre   = cierreMin();

  const porHora = new Map();

  for (const esp of espacios) {
    const paso     = esp.pasoMinutos || 30;
    const minTurno = esp.duracionMinima || 60;
    if (duracionMinutos < minTurno) continue;

    for (let t = apertura; t + duracionMinutos <= cierre; t += paso) {
      if (reservas.some(r => chocan(r, esp.id, fecha, t, t + duracionMinutos))) continue;
      if (creaHuecoMuerto(reservas, esp.id, fecha, t, t + duracionMinutos, minTurno)) continue;

      const clave = t;
      if (!porHora.has(clave)) porHora.set(clave, []);
      porHora.get(clave).push({
        id: esp.id, nombre: esp.nombre, tipo: esp.tipo,
        deporte: esp.deporte, precio: Math.round(esp.precioHora * duracionMinutos / 60)
      });
    }
  }

  return [...porHora.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, libres]) => ({
      hora_inicio: minToTime(t),
      hora_fin: minToTime(t + duracionMinutos),
      canchas_disponibles: libres.length,
      canchas: libres,
      deporte,
      precio_total: libres[0].precio
    }));
}

function deporteDeQuery(req) {
  const d = String(req.query.deporte || 'padel').toLowerCase();
  return DEPORTES_VALIDOS.includes(d) ? d : 'padel';
}

function textoSimple(fecha, duracion, deporte, slots) {
  const nombreDep = DEPORTES[deporte]?.nombre || deporte;
  const lineas = slots.map(s => `${s.hora_inicio} a ${s.hora_fin} - ${s.canchas_disponibles} libres`);
  return `Horarios disponibles de ${nombreDep} para ${fecha} (${duracion} min):\n` + lineas.join('\n');
}

/* ─── Publico: disponibilidad ─────────────────────────────── */

async function disponibilidadHandler(req, res, fecha) {
  try {
    if (!fecha) return res.status(400).json({ error: 'fecha es requerida (formato YYYY-MM-DD)' });
    const duracion = parseInt(req.query.duracion) || 60;
    const deporte  = deporteDeQuery(req);
    const slots    = await calcDisponibilidad(fecha, duracion, deporte);
    if (req.query.simple === '1' || req.query.simple === 'true') {
      return res.type('text').send(textoSimple(fecha, duracion, deporte, slots));
    }
    res.json(slots);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

router.get('/api/disponibilidad',        (req, res) => disponibilidadHandler(req, res, req.query.fecha));
router.get('/api/disponibilidad/:fecha', (req, res) => disponibilidadHandler(req, res, req.params.fecha));

router.get('/api/horarios/:fecha', async (req, res) => {
  try {
    const duracion = parseInt(req.query.duracion) || 60;
    res.json(await calcDisponibilidad(req.params.fecha, duracion, deporteDeQuery(req)));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─── Publico: catalogo de espacios / deportes / origenes ─── */

router.get('/api/espacios', async (req, res) => {
  try {
    const deporte  = req.query.deporte && DEPORTES_VALIDOS.includes(req.query.deporte) ? req.query.deporte : null;
    const espacios = await getEspacios({ deporte });
    res.json(espacios.map(aFormaLegacy));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/deportes', async (_req, res) => {
  try {
    const espacios = await getEspacios();
    res.json(DEPORTES_VALIDOS.map(d => ({
      id: d, ...DEPORTES[d],
      espacios: espacios.filter(e => e.deporte === d).map(aFormaLegacy)
    })).filter(d => d.espacios.length > 0));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/origenes', (_req, res) => {
  res.json(ORIGENES_VALIDOS.map(o => ({ id: o, ...ORIGENES[o] })));
});

/* ─── Publico: reservar (GET para n8n, POST para la web) ──── */

router.get('/api/reservar', async (req, res) => {
  if (req.query.datos) {
    try { req.body = JSON.parse(req.query.datos); } catch { req.body = {}; }
  } else {
    req.body = req.query;
  }
  return reservarHandler(req, res);
});

router.post('/api/reservar', (req, res) => reservarHandler(req, res));

async function reservarHandler(req, res) {
  try {
    const data = { ...req.query, ...req.body };
    const { nombre, telefono, metodoPago, fecha, hora_inicio, hora,
            duracion_minutos, tipoCancha, deporte: deporteRaw, origen: origenRaw, cancha_id } = data;

    const horaInicio = hora_inicio || hora;
    const durMin  = parseInt(duracion_minutos) || 60;
    const deporte = DEPORTES_VALIDOS.includes(String(deporteRaw || '').toLowerCase())
      ? String(deporteRaw).toLowerCase() : 'padel';
    /* Sin origen explicito asumimos la web. El bot de WhatsApp manda origen=whatsapp. */
    const origen = ORIGENES_VALIDOS.includes(String(origenRaw || '').toLowerCase())
      ? String(origenRaw).toLowerCase() : 'online';

    if (!nombre || !telefono || !metodoPago || !fecha || !horaInicio)
      return res.status(400).json({ error: 'Todos los campos son obligatorios' });

    const horaFin  = minToTime(timeToMin(horaInicio) + durMin);
    const reservas = await getReservasDia(fecha);
    const espacios = await getEspacios({ deporte });

    let libres = espacios.filter(e =>
      !reservas.some(r => chocan(r, e.id, fecha, timeToMin(horaInicio), timeToMin(horaInicio) + durMin))
    );

    if (!libres.length) return res.status(400).json({ error: `No hay ${DEPORTES[deporte]?.nombre || deporte} disponible para ese horario` });

    /* Si piden una cancha puntual y esta libre, respetamos la eleccion. */
    if (cancha_id) {
      const elegida = libres.find(e => e.id === parseInt(cancha_id));
      if (elegida) libres = [elegida];
    } else if (tipoCancha) {
      const norm = String(tipoCancha).toLowerCase();
      let preferidas;
      if (norm.includes('cubier') || norm.includes('techad')) preferidas = libres.filter(c => c.tipo === 'Cubierta');
      else if (norm.includes('aire') || norm.includes('libre') || norm.includes('descubier')) preferidas = libres.filter(c => c.tipo === 'Al aire libre');
      if (preferidas && preferidas.length > 0) libres = preferidas;
    }

    const espacio    = libres[Math.floor(Math.random() * libres.length)];
    const claveUnica = uuidv4();
    const monto      = Math.round(espacio.precioHora * durMin / 60);

    const reserva = await Reserva.create({
      fecha, hora_inicio: horaInicio, hora_fin: horaFin, duracion_minutos: durMin,
      cancha_id: espacio.id, deporte: espacio.deporte,
      cliente_nombre: nombre, cliente_telefono: telefono,
      metodo_pago: metodoPago, monto, claveUnica,
      origen, creado_por: ORIGENES[origen]?.nombre || origen
    });

    /* findOne + create en vez de findOrCreate: el mismo resultado, sin la función
       plpgsql que Sequelize arma para findOrCreate (pg-mem no la entiende). */
    const socio = (await Socio.findOne({ where: { telefono } }))
      || (await Socio.create({ nombre, telefono, puntos: 0, totalGastado: 0 }));
    await socio.update({ ultimaReserva: new Date(), metodoPago, puntos: socio.puntos + 10 });

    await auditar(null, {
      accion: 'reserva.crear', entidad: 'reserva', entidadId: reserva.id,
      actor: ORIGENES[origen]?.nombre || 'Sistema', actorRol: 'sistema',
      descripcion: `${nombre} reservó ${espacio.nombre} ${fecha} ${horaInicio}-${horaFin} (${ORIGENES[origen]?.nombre})`,
      monto, fecha, detalle: { origen, deporte: espacio.deporte, telefono }
    });

    res.json({
      id: claveUnica, claveUnica, nombre, telefono, fecha,
      hora_inicio: horaInicio, hora_fin: horaFin, hora: horaInicio,
      duracion_minutos: durMin,
      cancha: espacio.id, cancha_nombre: espacio.nombre, tipo: espacio.tipo,
      deporte: espacio.deporte, deporte_nombre: DEPORTES[espacio.deporte]?.nombre,
      origen, precio_total: monto, metodoPago
    });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError')
      return res.status(400).json({ error: 'Esa cancha ya esta reservada en ese horario' });
    res.status(500).json({ error: err.message });
  }
}

/* ─── Publico: mis reservas ───────────────────────────────── */

async function salidaPublica(r) {
  const esp = await getEspacio(r.cancha_id);
  return {
    claveUnica: r.claveUnica, nombre: r.cliente_nombre, fecha: r.fecha,
    hora_inicio: r.hora_inicio, hora_fin: r.hora_fin, hora: r.hora_inicio,
    cancha: r.cancha_id, cancha_nombre: esp?.nombre, tipo: esp?.tipo,
    deporte: r.deporte, deporte_nombre: DEPORTES[r.deporte]?.nombre,
    estado: r.estado_pago, metodoPago: r.metodo_pago,
    origen: r.origen, asistencia: r.asistencia,
    monto: r.monto, duracion_minutos: r.duracion_minutos
  };
}

router.get('/api/mis-reservas/verificar/:claveUnica', async (req, res) => {
  try {
    const r = await Reserva.findOne({ where: { claveUnica: req.params.claveUnica }, raw: true });
    if (!r) return res.status(404).json({ error: 'Reserva no encontrada' });
    res.json(await salidaPublica(r));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/mis-reservas/:telefono', async (req, res) => {
  try {
    const hoy = hoyStr();
    const reservas = await Reserva.findAll({
      where: { cliente_telefono: req.params.telefono, fecha: { [Op.gte]: hoy }, estado_reserva: 'confirmada' },
      order: [['fecha', 'ASC'], ['hora_inicio', 'ASC']],
      raw: true
    });
    res.json(await Promise.all(reservas.map(salidaPublica)));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/mis-reservas/:telefono/historial', async (req, res) => {
  try {
    const tel = req.params.telefono;
    const [total, reservas] = await Promise.all([
      Reserva.count({ where: { cliente_telefono: tel } }),
      Reserva.findAll({ where: { cliente_telefono: tel }, order: [['fecha', 'DESC'], ['hora_inicio', 'DESC']], limit: 50, raw: true })
    ]);
    res.json({ total, mostrando: reservas.length, reservas: await Promise.all(reservas.map(salidaPublica)) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/mis-reservas/cancelar', async (req, res) => {
  try {
    const { telefono, claveUnica } = req.body;
    if (!telefono || !claveUnica) return res.status(400).json({ error: 'telefono y claveUnica son requeridos' });
    const reserva = await Reserva.findOne({ where: { claveUnica, cliente_telefono: telefono } });
    if (!reserva) return res.status(404).json({ error: 'Reserva no encontrada o el telefono no coincide' });
    if (reserva.fecha < hoyStr()) return res.status(400).json({ error: 'No se puede cancelar una reserva pasada' });
    await reserva.update({ estado_reserva: 'cancelada' });
    await auditar(null, {
      accion: 'reserva.liberar', entidad: 'reserva', entidadId: reserva.id,
      actor: 'Cliente (autogestión)', actorRol: 'cliente',
      descripcion: `${reserva.cliente_nombre} canceló su turno del ${reserva.fecha} ${reserva.hora_inicio}`,
      fecha: reserva.fecha
    });
    res.json({ ok: true, mensaje: `Reserva del ${reserva.fecha} a las ${reserva.hora_inicio} cancelada correctamente` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─── Admin ───────────────────────────────────────────────── */

/*
  Agrega a cada turno lo que el panel necesita para pintarlo: nombre de cancha,
  origen con su color y el estado de la cuenta.

  detalle=false devuelve los totales y el corte por metodo, pero no las listas de
  consumiciones y pagos. Se usa para rangos largos (el historial de dos meses),
  donde mandar todas las lineas serian megas de JSON cada vez que refresca.
*/
async function enriquecer(reservas, detalle = true) {
  const espacios = await getEspacios({ soloActivos: false });
  const ids = reservas.map(r => r.id);
  const [consumos, pagos] = ids.length ? await Promise.all([
    Consumicion.findAll({ where: { reservaId: { [Op.in]: ids }, anulada: false }, raw: true }),
    Pago.findAll({ where: { reservaId: { [Op.in]: ids }, anulado: false }, raw: true })
  ]) : [[], []];

  const redondear = n => Math.round((n + Number.EPSILON) * 100) / 100;

  return reservas.map(r => {
    const esp  = espacios.find(e => e.id === r.cancha_id);
    const cons = consumos.filter(c => c.reservaId === r.id);
    const pg   = pagos.filter(p => p.reservaId === r.id);

    const facturable   = !ORIGENES_NO_FACTURABLES.includes(r.origen);
    const totalCancha  = facturable ? (r.monto || 0) : 0;
    const totalConsumo = redondear(cons.reduce((s, c) => s + (c.total || 0), 0));
    const totalPagado  = redondear(pg.reduce((s, p) => s + (p.monto || 0), 0));

    const porMetodo = { efectivo: 0, transferencia: 0, mercadopago: 0, tarjeta: 0 };
    pg.forEach(p => { if (porMetodo[p.metodo] !== undefined) porMetodo[p.metodo] = redondear(porMetodo[p.metodo] + p.monto); });

    const base = {
      ...r,
      cancha_nombre: esp?.nombre || `Cancha ${r.cancha_id}`,
      tipo: esp?.tipo || '',
      deporte: r.deporte || esp?.deporte || 'padel',
      deporte_nombre: DEPORTES[r.deporte || esp?.deporte]?.nombre || '',
      origen_nombre: ORIGENES[r.origen]?.nombre || r.origen,
      origen_color:  ORIGENES[r.origen]?.color  || '#64748b',
      total_cancha: totalCancha,
      total_consumiciones: totalConsumo,
      total_a_pagar: redondear(totalCancha + totalConsumo),
      total_pagado: totalPagado,
      saldo: redondear(totalCancha + totalConsumo - totalPagado),
      por_metodo: porMetodo
    };

    if (detalle) { base.consumiciones = cons; base.pagos = pg; }
    return base;
  });
}

router.get('/api/admin/reservas/recordatorios/:fecha', async (req, res) => {
  try {
    const reservas = await Reserva.findAll({
      where: { fecha: req.params.fecha, estado_reserva: 'confirmada' },
      order: [['hora_inicio', 'ASC'], ['cancha_id', 'ASC']], raw: true
    });
    res.json(await enriquecer(reservas));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/admin/reservas', async (req, res) => {
  try {
    const { desde, hasta, origen, deporte, asistencia } = req.query;
    if (!desde || !hasta) return res.status(400).json({ error: 'desde y hasta son requeridos' });
    const where = { fecha: { [Op.gte]: desde, [Op.lte]: hasta } };
    if (origen)     where.origen = origen;
    if (deporte)    where.deporte = deporte;
    if (asistencia) where.asistencia = asistencia;
    const reservas = await Reserva.findAll({ where, order: [['fecha', 'ASC'], ['hora_inicio', 'ASC']], raw: true });
    res.json(await enriquecer(reservas, req.query.detalle === '1'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/admin/reservas/:fecha', async (req, res) => {
  try {
    const reservas = await Reserva.findAll({
      where: { fecha: req.params.fecha, estado_reserva: 'confirmada' },
      order: [['cancha_id', 'ASC'], ['hora_inicio', 'ASC']], raw: true
    });
    res.json(await enriquecer(reservas));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/admin/reserva/:id/cuenta', async (req, res) => {
  try {
    const cuenta = await cuentaDeReserva(parseInt(req.params.id));
    if (!cuenta) return res.status(404).json({ error: 'Reserva no encontrada' });
    res.json(cuenta);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* Alta de turno desde el panel. Se firma con PIN despues de cargarlo. */
router.post('/api/admin/reserva', async (req, res) => {
  try {
    const usuario = await autorizar(req, 'reserva.crear');

    const { nombre, cliente_nombre, telefono, cliente_telefono,
            fecha, hora_inicio, hora, duracion_minutos,
            cancha, canchaId, cancha_id, origen: origenRaw, profesorId, notas } = req.body;

    const nm  = nombre || cliente_nombre;
    const tel = telefono || cliente_telefono || '';
    const hi  = hora_inicio || hora;
    const dur = parseInt(duracion_minutos) || 60;
    const eId = parseInt(cancha_id || canchaId || cancha);
    const origen = ORIGENES_VALIDOS.includes(String(origenRaw || '').toLowerCase())
      ? String(origenRaw).toLowerCase() : 'mostrador';

    if (!fecha || !hi || !eId) return res.status(400).json({ error: 'Faltan campos obligatorios (fecha, hora y cancha)' });
    if (!nm && origen !== 'bloqueo') return res.status(400).json({ error: 'Falta el nombre del cliente' });

    const espacio = await getEspacio(eId);
    if (!espacio) return res.status(400).json({ error: 'Esa cancha no existe' });

    const horaFin = minToTime(timeToMin(hi) + dur);
    const existentes = await getReservasDia(fecha);
    if (existentes.some(r => chocan(r, eId, fecha, timeToMin(hi), timeToMin(hi) + dur)))
      return res.status(400).json({ error: `${espacio.nombre} ya está ocupada en ese horario` });

    let profesorNombre = '';
    if (origen === 'profesor' && profesorId) {
      const prof = await Profesor.findByPk(parseInt(profesorId), { raw: true });
      profesorNombre = prof?.nombre || '';
    }

    const esBloqueo = origen === 'bloqueo';
    const monto = esBloqueo ? 0 : Math.round(espacio.precioHora * dur / 60);

    const reserva = await Reserva.create({
      fecha, hora_inicio: hi, hora_fin: horaFin, duracion_minutos: dur,
      cancha_id: eId, deporte: espacio.deporte,
      cliente_nombre: nm || (ORIGENES[origen]?.nombre || 'Bloqueado'),
      cliente_telefono: tel,
      monto, claveUnica: uuidv4(), origen,
      profesor_id: origen === 'profesor' && profesorId ? parseInt(profesorId) : null,
      profesor_nombre: profesorNombre,
      notas: notas || '',
      creado_por_id: usuario.id, creado_por: usuario.nombre
    });

    await auditar(usuario, {
      accion: 'reserva.crear', entidad: 'reserva', entidadId: reserva.id,
      descripcion: `Cargó ${espacio.nombre} ${fecha} ${hi}-${horaFin} · ${reserva.cliente_nombre} (${ORIGENES[origen]?.nombre})`,
      monto, fecha, detalle: { origen, deporte: espacio.deporte, profesorNombre }
    });

    const [salida] = await enriquecer([reserva.toJSON()]);
    res.json(salida);
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError')
      return res.status(400).json({ error: 'Esa cancha ya esta ocupada en ese horario' });
    responderError(res, err);
  }
});

/* Editar turno (cliente, notas, origen, profesor). */
router.patch('/api/admin/reserva', async (req, res) => {
  try {
    const usuario = await autorizar(req, 'reserva.editar');
    const { id, claveUnica } = req.body;
    const reserva = await Reserva.findOne({ where: claveUnica ? { claveUnica } : { id } });
    if (!reserva) return res.status(404).json({ error: 'Reserva no encontrada' });

    const cambios = {};
    ['cliente_nombre', 'cliente_telefono', 'notas'].forEach(f => {
      if (req.body[f] !== undefined) cambios[f] = req.body[f];
    });
    if (req.body.origen && ORIGENES_VALIDOS.includes(req.body.origen)) cambios.origen = req.body.origen;
    if (req.body.profesorId !== undefined) {
      cambios.profesor_id = req.body.profesorId ? parseInt(req.body.profesorId) : null;
      const prof = cambios.profesor_id ? await Profesor.findByPk(cambios.profesor_id, { raw: true }) : null;
      cambios.profesor_nombre = prof?.nombre || '';
    }

    await reserva.update(cambios);
    await auditar(usuario, {
      accion: 'reserva.editar', entidad: 'reserva', entidadId: reserva.id,
      descripcion: `Editó el turno de ${reserva.cliente_nombre} (${reserva.fecha} ${reserva.hora_inicio})`,
      fecha: reserva.fecha, detalle: cambios
    });

    const [salida] = await enriquecer([reserva.toJSON()]);
    res.json(salida);
  } catch (err) { responderError(res, err); }
});

/* Asistencia: presente / falta / pendiente. */
router.patch('/api/admin/reserva/asistencia', async (req, res) => {
  try {
    const usuario = await autorizar(req, 'reserva.asistencia');
    const { id, claveUnica, asistencia } = req.body;
    if (!['presente', 'falta', 'pendiente'].includes(asistencia))
      return res.status(400).json({ error: 'asistencia debe ser presente, falta o pendiente' });

    const reserva = await Reserva.findOne({ where: claveUnica ? { claveUnica } : { id } });
    if (!reserva) return res.status(404).json({ error: 'Reserva no encontrada' });

    await reserva.update({ asistencia });
    await auditar(usuario, {
      accion: 'reserva.asistencia', entidad: 'reserva', entidadId: reserva.id,
      descripcion: asistencia === 'falta'
        ? `Marcó FALTA de ${reserva.cliente_nombre} (${reserva.fecha} ${reserva.hora_inicio})`
        : `Marcó ${asistencia} a ${reserva.cliente_nombre} (${reserva.fecha} ${reserva.hora_inicio})`,
      fecha: reserva.fecha, detalle: { asistencia }
    });

    const [salida] = await enriquecer([reserva.toJSON()]);
    res.json(salida);
  } catch (err) { responderError(res, err); }
});

/* Liberar turno. Solo jefe y dueño. */
router.delete('/api/admin/reserva', async (req, res) => {
  try {
    const usuario = await autorizar(req, 'reserva.liberar');
    const { id, claveUnica, motivo } = req.body;
    const where = claveUnica ? { claveUnica } : id ? { id } : null;
    if (!where) return res.status(400).json({ error: 'id o claveUnica requerido' });

    const reserva = await Reserva.findOne({ where });
    if (!reserva) return res.status(404).json({ error: 'Reserva no encontrada' });

    const cuenta = await cuentaDeReserva(reserva.id);
    await reserva.update({ estado_reserva: 'cancelada' });
    await auditar(usuario, {
      accion: 'reserva.liberar', entidad: 'reserva', entidadId: reserva.id,
      descripcion: `Liberó ${reserva.fecha} ${reserva.hora_inicio} · ${reserva.cliente_nombre}${motivo ? ' — ' + motivo : ''}`,
      monto: cuenta?.totalPagado || 0, fecha: reserva.fecha,
      detalle: { motivo: motivo || '', yaPagado: cuenta?.totalPagado || 0 }
    });

    res.json({ ok: true, yaPagado: cuenta?.totalPagado || 0 });
  } catch (err) { responderError(res, err); }
});

module.exports = router;
module.exports.calcDisponibilidad = calcDisponibilidad;
module.exports.timeToMin = timeToMin;
module.exports.minToTime = minToTime;
module.exports.HORA_APERTURA = HORA_APERTURA;
module.exports.HORA_CIERRE = HORA_CIERRE;
