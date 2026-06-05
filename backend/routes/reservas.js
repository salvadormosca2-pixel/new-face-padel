const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const Reserva = require('../models/Reserva');
const Socio   = require('../models/Socio');

const CANCHAS = [
  { id: 1, nombre: 'Cancha 1', tipo: 'Cubierta', precioHora: 5000 },
  { id: 2, nombre: 'Cancha 2', tipo: 'Cubierta', precioHora: 5000 },
  { id: 3, nombre: 'Cancha 3', tipo: 'Al aire libre', precioHora: 4000 },
  { id: 4, nombre: 'Cancha 4', tipo: 'Al aire libre', precioHora: 4000 },
];
const HORA_APERTURA = '15:00';
const HORA_CIERRE   = '00:00';

function timeToMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function minToTime(m) { const h = Math.floor(m / 60) % 24; return String(h).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
function cierreMin() { const c = timeToMin(HORA_CIERRE); return c <= timeToMin(HORA_APERTURA) ? c + 1440 : c; }
function calcPrecio(canchaId, durMin) { const c = CANCHAS.find(x => x.id === canchaId); return c ? Math.round(c.precioHora * durMin / 60) : 0; }

function chocan(r, canchaId, fecha, inicioMin, finMin) {
  if (r.cancha_id !== canchaId || r.fecha !== fecha || r.estado_reserva === 'cancelada') return false;
  const rInicio = timeToMin(r.hora_inicio);
  const rFin    = timeToMin(r.hora_fin);
  const rFinAdj = rFin <= rInicio ? rFin + 1440 : rFin;
  const finAdj  = finMin <= inicioMin ? finMin + 1440 : finMin;
  return rInicio < finAdj && rFinAdj > inicioMin;
}

async function getReservasDia(fecha) {
  return Reserva.findAll({
    where: { fecha, estado_reserva: 'confirmada' },
    raw: true
  });
}

const MIN_TURNO = 60;

function creaHuecoMuerto(reservas, canchaId, fecha, slotStart, slotEnd, apertura, cierre) {
  const court = reservas
    .filter(r => r.cancha_id === canchaId && r.fecha === fecha && r.estado_reserva !== 'cancelada')
    .map(r => {
      let s = timeToMin(r.hora_inicio);
      let e = timeToMin(r.hora_fin);
      if (e <= s) e += 1440;
      return { start: s, end: e };
    })
    .sort((a, b) => a.start - b.start);

  if (court.length === 0) return false;

  let prevEnd = null;
  for (const r of court) {
    if (r.end <= slotStart) prevEnd = r.end;
  }
  if (prevEnd !== null) {
    const gapBefore = slotStart - prevEnd;
    if (gapBefore > 0 && gapBefore < MIN_TURNO) return true;
  }

  let nextStart = null;
  for (const r of court) {
    if (r.start >= slotEnd) { nextStart = r.start; break; }
  }
  if (nextStart !== null) {
    const gapAfter = nextStart - slotEnd;
    if (gapAfter > 0 && gapAfter < MIN_TURNO) return true;
  }

  return false;
}

async function calcDisponibilidad(fecha, duracionMinutos) {
  const reservas = await getReservasDia(fecha);
  const apertura = timeToMin(HORA_APERTURA);
  const cierre   = cierreMin();
  const resultados = [];

  for (let t = apertura; t + duracionMinutos <= cierre; t += 30) {
    const canchasLibres = [];
    CANCHAS.forEach(cancha => {
      const hay = reservas.some(r => chocan(r, cancha.id, fecha, t, t + duracionMinutos));
      if (hay) return;
      if (creaHuecoMuerto(reservas, cancha.id, fecha, t, t + duracionMinutos, apertura, cierre)) return;
      canchasLibres.push({ id: cancha.id, nombre: cancha.nombre, tipo: cancha.tipo });
    });
    if (canchasLibres.length > 0) {
      resultados.push({
        hora_inicio: minToTime(t),
        hora_fin: minToTime(t + duracionMinutos),
        canchas_disponibles: canchasLibres.length,
        canchas: canchasLibres,
        precio_total: calcPrecio(canchasLibres[0].id, duracionMinutos)
      });
    }
  }
  return resultados;
}

// -- Publico: disponibilidad con duracion --

router.get('/api/disponibilidad', async (req, res) => {
  try {
    const fecha = req.query.fecha;
    if (!fecha) return res.status(400).json({ error: 'fecha es requerida (formato YYYY-MM-DD)' });
    const duracion = parseInt(req.query.duracion) || 60;
    const slots = await calcDisponibilidad(fecha, duracion);
    const simple = req.query.simple === '1' || req.query.simple === 'true';
    if (simple) {
      const lineas = slots.map(s => `${s.hora_inicio} a ${s.hora_fin} - ${s.canchas_disponibles} canchas libres`);
      return res.type('text').send(`Horarios disponibles para ${fecha} (${duracion} min):\n` + lineas.join('\n'));
    }
    res.json(slots);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/disponibilidad/:fecha', async (req, res) => {
  try {
    const fecha = req.params.fecha;
    const duracion = parseInt(req.query.duracion) || 60;
    const slots = await calcDisponibilidad(fecha, duracion);
    const simple = req.query.simple === '1' || req.query.simple === 'true';
    if (simple) {
      const lineas = slots.map(s => `${s.hora_inicio} a ${s.hora_fin} - ${s.canchas_disponibles} canchas libres`);
      return res.type('text').send(`Horarios disponibles para ${fecha} (${duracion} min):\n` + lineas.join('\n'));
    }
    res.json(slots);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// -- Publico: horarios (formato simplificado por hora) --

router.get('/api/horarios/:fecha', async (req, res) => {
  try {
    const duracion = parseInt(req.query.duracion) || 60;
    const slots = await calcDisponibilidad(req.params.fecha, duracion);
    res.json(slots);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// -- Publico: reservar (GET para n8n, POST para web) --

router.get('/api/reservar', async (req, res) => {
  if (req.query.datos) {
    try { req.body = JSON.parse(req.query.datos); } catch { req.body = {}; }
  } else {
    req.body = req.query;
  }
  return reservarHandler(req, res);
});

router.post('/api/reservar', async (req, res) => {
  return reservarHandler(req, res);
});

async function reservarHandler(req, res) {
  try {
    const data = { ...req.query, ...req.body };
    const { nombre, telefono, metodoPago, fecha, hora_inicio, hora, duracion_minutos, tipoCancha } = data;
    const horaInicio = hora_inicio || hora;
    const durMin = parseInt(duracion_minutos) || 60;

    if (!nombre || !telefono || !metodoPago || !fecha || !horaInicio)
      return res.status(400).json({ error: 'Todos los campos son obligatorios' });

    const horaFin = minToTime(timeToMin(horaInicio) + durMin);
    const reservas = await getReservasDia(fecha);

    let libres = CANCHAS.filter(cancha =>
      !reservas.some(r => chocan(r, cancha.id, fecha, timeToMin(horaInicio), timeToMin(horaInicio) + durMin))
    );

    if (!libres.length) return res.status(400).json({ error: 'No hay canchas disponibles para ese horario' });

    if (tipoCancha) {
      const norm = tipoCancha.toLowerCase();
      let preferidas;
      if (norm.includes('cubier') || norm.includes('techad')) {
        preferidas = libres.filter(c => c.tipo === 'Cubierta');
      } else if (norm.includes('aire') || norm.includes('libre') || norm.includes('descubier')) {
        preferidas = libres.filter(c => c.tipo === 'Al aire libre');
      }
      if (preferidas && preferidas.length > 0) libres = preferidas;
    }

    const cancha     = libres[Math.floor(Math.random() * libres.length)];
    const claveUnica = uuidv4();
    const monto      = calcPrecio(cancha.id, durMin);

    await Reserva.create({
      fecha, hora_inicio: horaInicio, hora_fin: horaFin, duracion_minutos: durMin,
      cancha_id: cancha.id, cliente_nombre: nombre, cliente_telefono: telefono,
      metodo_pago: metodoPago, monto, claveUnica
    });

    const [socio] = await Socio.findOrCreate({
      where: { telefono },
      defaults: { nombre, puntos: 0, totalGastado: 0 }
    });
    await socio.update({ ultimaReserva: new Date(), metodoPago, puntos: socio.puntos + 10 });

    res.json({
      id: claveUnica, claveUnica, nombre, telefono, fecha,
      hora_inicio: horaInicio, hora_fin: horaFin, hora: horaInicio,
      duracion_minutos: durMin,
      cancha: cancha.id, cancha_nombre: cancha.nombre, tipo: cancha.tipo,
      precio_total: monto, metodoPago
    });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError')
      return res.status(400).json({ error: 'Esa cancha ya esta reservada en ese horario' });
    res.status(500).json({ error: err.message });
  }
}

// -- Publico: mis reservas --

router.get('/api/mis-reservas/verificar/:claveUnica', async (req, res) => {
  try {
    const r = await Reserva.findOne({ where: { claveUnica: req.params.claveUnica }, raw: true });
    if (!r) return res.status(404).json({ error: 'Reserva no encontrada' });
    const cancha = CANCHAS.find(c => c.id === r.cancha_id);
    res.json({
      claveUnica: r.claveUnica, nombre: r.cliente_nombre, fecha: r.fecha,
      hora_inicio: r.hora_inicio, hora_fin: r.hora_fin, hora: r.hora_inicio,
      cancha: r.cancha_id, tipo: cancha?.tipo, estado: r.estado_pago,
      metodoPago: r.metodo_pago, duracion_minutos: r.duracion_minutos
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/mis-reservas/:telefono', async (req, res) => {
  try {
    const hoy = new Date().toISOString().split('T')[0];
    const reservas = await Reserva.findAll({
      where: { cliente_telefono: req.params.telefono, fecha: { [Op.gte]: hoy }, estado_reserva: 'confirmada' },
      order: [['fecha', 'ASC'], ['hora_inicio', 'ASC']],
      raw: true
    });
    res.json(reservas.map(r => {
      const cancha = CANCHAS.find(c => c.id === r.cancha_id);
      return {
        claveUnica: r.claveUnica, fecha: r.fecha,
        hora_inicio: r.hora_inicio, hora_fin: r.hora_fin, hora: r.hora_inicio,
        cancha: r.cancha_id, tipo: cancha?.tipo,
        estado: r.estado_pago, metodoPago: r.metodo_pago,
        duracion_minutos: r.duracion_minutos
      };
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/mis-reservas/:telefono/historial', async (req, res) => {
  try {
    const tel = req.params.telefono;
    const [total, reservas] = await Promise.all([
      Reserva.count({ where: { cliente_telefono: tel } }),
      Reserva.findAll({
        where: { cliente_telefono: tel },
        order: [['fecha', 'DESC'], ['hora_inicio', 'DESC']],
        limit: 50, raw: true
      })
    ]);
    res.json({
      total, mostrando: reservas.length,
      reservas: reservas.map(r => {
        const cancha = CANCHAS.find(c => c.id === r.cancha_id);
        return {
          claveUnica: r.claveUnica, fecha: r.fecha,
          hora_inicio: r.hora_inicio, hora_fin: r.hora_fin,
          cancha: r.cancha_id, tipo: cancha?.tipo,
          estado: r.estado_pago, metodoPago: r.metodo_pago,
          monto: r.monto, duracion_minutos: r.duracion_minutos
        };
      })
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/mis-reservas/cancelar', async (req, res) => {
  try {
    const { telefono, claveUnica } = req.body;
    if (!telefono || !claveUnica) return res.status(400).json({ error: 'telefono y claveUnica son requeridos' });
    const reserva = await Reserva.findOne({ where: { claveUnica, cliente_telefono: telefono } });
    if (!reserva) return res.status(404).json({ error: 'Reserva no encontrada o el telefono no coincide' });
    const hoy = new Date().toISOString().split('T')[0];
    if (reserva.fecha < hoy) return res.status(400).json({ error: 'No se puede cancelar una reserva pasada' });
    await reserva.update({ estado_reserva: 'cancelada' });
    res.json({ ok: true, mensaje: `Reserva del ${reserva.fecha} a las ${reserva.hora_inicio} cancelada correctamente` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// -- Admin --

router.get('/api/admin/reservas/recordatorios/:fecha', async (req, res) => {
  try {
    const reservas = await Reserva.findAll({
      where: { fecha: req.params.fecha, estado_reserva: 'confirmada' },
      order: [['hora_inicio', 'ASC'], ['cancha_id', 'ASC']],
      raw: true
    });
    res.json(reservas.map(r => {
      const cancha = CANCHAS.find(c => c.id === r.cancha_id);
      return {
        nombre: r.cliente_nombre, telefono: r.cliente_telefono,
        fecha: r.fecha, hora_inicio: r.hora_inicio, hora_fin: r.hora_fin,
        cancha: r.cancha_id, tipo: cancha?.tipo,
        estado: r.estado_pago, claveUnica: r.claveUnica
      };
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/admin/reservas', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) return res.status(400).json({ error: 'desde y hasta son requeridos' });
    const reservas = await Reserva.findAll({
      where: { fecha: { [Op.gte]: desde, [Op.lte]: hasta } },
      order: [['fecha', 'ASC'], ['hora_inicio', 'ASC']],
      raw: true
    });
    res.json(reservas);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/admin/reservas/:fecha', async (req, res) => {
  try {
    const reservas = await Reserva.findAll({
      where: { fecha: req.params.fecha, estado_reserva: 'confirmada' },
      order: [['cancha_id', 'ASC'], ['hora_inicio', 'ASC']],
      raw: true
    });
    res.json(reservas);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/api/admin/pago', async (req, res) => {
  try {
    const { id, claveUnica, metodoPago, metodoCobro, monto } = req.body;
    const where = claveUnica ? { claveUnica } : { id };
    const reserva = await Reserva.findOne({ where });
    if (!reserva) return res.status(404).json({ error: 'Reserva no encontrada' });
    await reserva.update({
      estado_pago: 'pagado',
      metodo_pago: metodoPago || metodoCobro || reserva.metodo_pago,
      monto: monto || reserva.monto
    });
    if (monto && reserva.cliente_telefono) {
      const socio = await Socio.findOne({ where: { telefono: reserva.cliente_telefono } });
      if (socio) await socio.update({ totalGastado: socio.totalGastado + monto });
    }
    res.json(reserva);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/admin/reserva', async (req, res) => {
  try {
    const { nombre, cliente_nombre, telefono, cliente_telefono, metodoPago, metodo_pago,
            fecha, hora_inicio, hora, duracion_minutos, cancha, canchaId, cancha_id } = req.body;

    const nm       = nombre || cliente_nombre;
    const tel      = telefono || cliente_telefono || '';
    const met      = metodoPago || metodo_pago || 'efectivo';
    const hi       = hora_inicio || hora;
    const dur      = duracion_minutos || 60;
    const cId      = cancha_id || canchaId || cancha;

    if (!nm || !fecha || !hi || !cId)
      return res.status(400).json({ error: 'Faltan campos obligatorios' });

    const canchaNum  = parseInt(cId);
    const canchaInfo = CANCHAS.find(c => c.id === canchaNum);
    const horaFin    = minToTime(timeToMin(hi) + dur);
    const claveUnica = uuidv4();
    const monto      = calcPrecio(canchaNum, dur);

    const existentes = await getReservasDia(fecha);
    const colision = existentes.some(r => chocan(r, canchaNum, fecha, timeToMin(hi), timeToMin(hi) + dur));
    if (colision) return res.status(400).json({ error: 'Ese horario ya esta ocupado en esa cancha' });

    const reserva = await Reserva.create({
      fecha, hora_inicio: hi, hora_fin: horaFin, duracion_minutos: dur,
      cancha_id: canchaNum, cliente_nombre: nm, cliente_telefono: tel,
      metodo_pago: met, monto, claveUnica
    });

    res.json({ ...reserva.toJSON(), tipo: canchaInfo?.tipo });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError')
      return res.status(400).json({ error: 'Esa cancha ya esta ocupada en ese horario' });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/admin/reserva', async (req, res) => {
  try {
    const { id, claveUnica } = req.body;
    const where = claveUnica ? { claveUnica } : id ? { id } : null;
    if (!where) return res.status(400).json({ error: 'id o claveUnica requerido' });
    const reserva = await Reserva.findOne({ where });
    if (!reserva) return res.status(404).json({ error: 'Reserva no encontrada' });
    await reserva.update({ estado_reserva: 'cancelada' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
module.exports.calcDisponibilidad = calcDisponibilidad;
module.exports.CANCHAS = CANCHAS;
