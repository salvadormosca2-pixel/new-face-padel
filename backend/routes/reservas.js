const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const Reserva = require('../models/Reserva');
const Socio   = require('../models/Socio');

const HORAS   = ['15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00','23:00'];
const CANCHAS = [1, 2, 3, 4];
const TIPO    = { 1: 'Cubierta', 2: 'Cubierta', 3: 'Al aire libre', 4: 'Al aire libre' };

// ── Público: disponibilidad ──

router.get('/api/horarios/:fecha', async (req, res) => {
  try {
    const reservas = await Reserva.find({ fecha: req.params.fecha }).lean();
    const horarios = HORAS.map(hora => {
      const ocupadas = reservas.filter(r => r.hora === hora).map(r => r.cancha);
      const libres   = CANCHAS.filter(c => !ocupadas.includes(c));
      return {
        hora,
        libres: libres.length,
        total: 4,
        canchasLibres: libres.map(c => ({ cancha: c, tipo: TIPO[c] }))
      };
    });
    res.json(horarios);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Público: reservar ──

router.post('/api/reservar', async (req, res) => {
  try {
    const { nombre, telefono, metodoPago, fecha, hora, tipoCancha } = req.body;
    if (!nombre || !telefono || !metodoPago || !fecha || !hora)
      return res.status(400).json({ error: 'Todos los campos son obligatorios' });

    const ocupadas = (await Reserva.find({ fecha, hora }).lean()).map(r => r.cancha);
    let libres = CANCHAS.filter(c => !ocupadas.includes(c));
    if (!libres.length) return res.status(400).json({ error: 'Horario completo' });

    if (tipoCancha) {
      const norm = tipoCancha.toLowerCase();
      let preferidas;
      if (norm.includes('cubier') || norm.includes('techad')) {
        preferidas = libres.filter(c => TIPO[c] === 'Cubierta');
      } else if (norm.includes('aire') || norm.includes('libre') || norm.includes('descubier')) {
        preferidas = libres.filter(c => TIPO[c] === 'Al aire libre');
      }
      if (preferidas && preferidas.length > 0) libres = preferidas;
    }

    const cancha     = libres[Math.floor(Math.random() * libres.length)];
    const claveUnica = uuidv4();

    const reserva = await new Reserva({ fecha, hora, cancha, nombre, telefono, metodoPago, claveUnica }).save();

    await Socio.findOneAndUpdate(
      { telefono },
      { $setOnInsert: { nombre }, $set: { ultimaReserva: new Date(), metodoPago }, $inc: { puntos: 10 } },
      { upsert: true }
    );

    res.json({ claveUnica, cancha, tipo: TIPO[cancha], nombre, fecha, hora, metodoPago });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Esa cancha ya está reservada en ese horario' });
    res.status(500).json({ error: err.message });
  }
});

// ── Público: mis reservas, verificar, cancelar ──

router.get('/api/mis-reservas/verificar/:claveUnica', async (req, res) => {
  try {
    const r = await Reserva.findOne({ claveUnica: req.params.claveUnica }).lean();
    if (!r) return res.status(404).json({ error: 'Reserva no encontrada' });
    res.json({
      claveUnica: r.claveUnica,
      nombre: r.nombre,
      fecha: r.fecha,
      hora: r.hora,
      cancha: r.cancha,
      tipo: TIPO[r.cancha],
      estado: r.estado,
      metodoPago: r.metodoPago
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/mis-reservas/:telefono', async (req, res) => {
  try {
    const hoy = new Date().toISOString().split('T')[0];
    const reservas = await Reserva.find({
      telefono: req.params.telefono,
      fecha: { $gte: hoy }
    }).sort({ fecha: 1, hora: 1 }).lean();

    res.json(reservas.map(r => ({
      claveUnica: r.claveUnica,
      fecha: r.fecha,
      hora: r.hora,
      cancha: r.cancha,
      tipo: TIPO[r.cancha],
      estado: r.estado,
      metodoPago: r.metodoPago
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/mis-reservas/:telefono/historial', async (req, res) => {
  try {
    const tel = req.params.telefono;
    const [total, reservas] = await Promise.all([
      Reserva.countDocuments({ telefono: tel }),
      Reserva.find({ telefono: tel }).sort({ fecha: -1, hora: -1 }).limit(50).lean()
    ]);

    res.json({
      total,
      mostrando: reservas.length,
      reservas: reservas.map(r => ({
        claveUnica: r.claveUnica,
        fecha: r.fecha,
        hora: r.hora,
        cancha: r.cancha,
        tipo: TIPO[r.cancha],
        estado: r.estado,
        metodoPago: r.metodoPago,
        monto: r.monto
      }))
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/mis-reservas/cancelar', async (req, res) => {
  try {
    const { telefono, claveUnica } = req.body;
    if (!telefono || !claveUnica) return res.status(400).json({ error: 'telefono y claveUnica son requeridos' });

    const reserva = await Reserva.findOne({ claveUnica, telefono });
    if (!reserva) return res.status(404).json({ error: 'Reserva no encontrada o el teléfono no coincide' });

    const hoy = new Date().toISOString().split('T')[0];
    if (reserva.fecha < hoy) return res.status(400).json({ error: 'No se puede cancelar una reserva pasada' });

    await Reserva.deleteOne({ _id: reserva._id });
    res.json({ ok: true, mensaje: `Reserva del ${reserva.fecha} a las ${reserva.hora} cancelada correctamente` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin ──

router.get('/api/admin/reservas/recordatorios/:fecha', async (req, res) => {
  try {
    const reservas = await Reserva.find({ fecha: req.params.fecha })
      .sort({ hora: 1, cancha: 1 }).lean();

    res.json(reservas.map(r => ({
      nombre: r.nombre,
      telefono: r.telefono,
      fecha: r.fecha,
      hora: r.hora,
      cancha: r.cancha,
      tipo: TIPO[r.cancha],
      estado: r.estado,
      claveUnica: r.claveUnica
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/admin/reservas', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) return res.status(400).json({ error: 'desde y hasta son requeridos' });
    const reservas = await Reserva.find({ fecha: { $gte: desde, $lte: hasta } }).lean();
    res.json(reservas);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/admin/reservas/:fecha', async (req, res) => {
  try {
    const reservas = await Reserva.find({ fecha: req.params.fecha }).sort({ cancha: 1, hora: 1 }).lean();
    const resultado = {};
    CANCHAS.forEach(c => {
      resultado[c] = {
        tipo: TIPO[c],
        reservas: HORAS.map(hora => {
          const r = reservas.find(x => x.cancha === c && x.hora === hora);
          return r
            ? { hora, cancha: c, tipo: TIPO[c], _id: r._id, claveUnica: r.claveUnica,
                nombre: r.nombre, telefono: r.telefono, metodoPago: r.metodoPago,
                estado: r.estado, metodoCobro: r.metodoCobro, monto: r.monto, libre: false }
            : { hora, cancha: c, tipo: TIPO[c], libre: true };
        })
      };
    });
    res.json(resultado);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/api/admin/pago', async (req, res) => {
  try {
    const { claveUnica, metodoCobro, monto } = req.body;
    const reserva = await Reserva.findOneAndUpdate(
      { claveUnica },
      { estado: 'pagado', metodoCobro, monto: monto || 0 },
      { new: true }
    );
    if (!reserva) return res.status(404).json({ error: 'Reserva no encontrada' });
    if (monto) await Socio.findOneAndUpdate({ telefono: reserva.telefono }, { $inc: { totalGastado: monto } });
    res.json(reserva);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/admin/reserva', async (req, res) => {
  try {
    const { nombre, telefono, metodoPago, fecha, hora, cancha } = req.body;
    if (!nombre || !fecha || !hora || !cancha)
      return res.status(400).json({ error: 'Faltan campos obligatorios' });

    const canchaNum  = parseInt(cancha);
    const claveUnica = uuidv4();
    const reserva = await new Reserva({
      fecha, hora, cancha: canchaNum, nombre, telefono,
      metodoPago: metodoPago || 'efectivo', claveUnica
    }).save();

    res.json({ ...reserva.toObject(), tipo: TIPO[canchaNum] });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Esa cancha ya está ocupada en ese horario' });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/admin/reserva', async (req, res) => {
  try {
    const { claveUnica } = req.body;
    const deleted = await Reserva.findOneAndDelete({ claveUnica });
    if (!deleted) return res.status(404).json({ error: 'Reserva no encontrada' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
