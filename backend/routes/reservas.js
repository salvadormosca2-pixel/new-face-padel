const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const Reserva = require('../models/Reserva');
const Socio   = require('../models/Socio');

const HORAS = ['15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00','23:00'];
const CANCHAS = [1, 2, 3, 4];
const TIPO = { 1: 'Cubierta', 2: 'Cubierta', 3: 'Al aire libre', 4: 'Al aire libre' };

// ─── PÚBLICO ───────────────────────────────────────────────────────────────

// GET /horarios/:fecha  →  disponibilidad hora por hora
router.get('/horarios/:fecha', async (req, res) => {
  try {
    const reservas = await Reserva.find({ fecha: req.params.fecha });
    const horarios = HORAS.map(hora => {
      const ocupadas = reservas.filter(r => r.hora === hora).map(r => r.cancha);
      const libres   = CANCHAS.filter(c => !ocupadas.includes(c)).length;
      return { hora, libres, total: 4 };
    });
    res.json(horarios);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /reservar  →  crear reserva (cancha asignada al azar)
router.post('/reservar', async (req, res) => {
  try {
    const { nombre, telefono, metodoPago, fecha, hora } = req.body;
    if (!nombre || !telefono || !metodoPago || !fecha || !hora)
      return res.status(400).json({ error: 'Todos los campos son obligatorios' });

    const ocupadas    = (await Reserva.find({ fecha, hora })).map(r => r.cancha);
    const libres      = CANCHAS.filter(c => !ocupadas.includes(c));
    if (!libres.length) return res.status(400).json({ error: 'Horario completo' });

    const cancha     = libres[Math.floor(Math.random() * libres.length)];
    const claveUnica = uuidv4();

    const reserva = await new Reserva({ fecha, hora, cancha, nombre, telefono, metodoPago, claveUnica }).save();

    // Upsert socio + sumar 10 puntos por reserva
    await Socio.findOneAndUpdate(
      { telefono },
      { $setOnInsert: { nombre }, $set: { ultimaReserva: new Date(), metodoPago }, $inc: { puntos: 10 } },
      { upsert: true, new: true }
    );

    res.json({ claveUnica, cancha, tipo: TIPO[cancha], nombre, fecha, hora, metodoPago });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ADMIN ─────────────────────────────────────────────────────────────────

// GET /admin/reservas/:fecha  →  todas las canchas con slots 15-23
router.get('/admin/reservas/:fecha', async (req, res) => {
  try {
    const reservas = await Reserva.find({ fecha: req.params.fecha }).sort({ cancha: 1, hora: 1 });
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

// PATCH /admin/pago  →  marcar pagado con método y monto
router.patch('/admin/pago', async (req, res) => {
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

// POST /admin/reserva  →  agregar turno manual desde admin (cancha específica)
router.post('/admin/reserva', async (req, res) => {
  try {
    const { nombre, telefono, metodoPago, fecha, hora, cancha } = req.body;
    if (!nombre || !telefono || !fecha || !hora || !cancha)
      return res.status(400).json({ error: 'Faltan campos obligatorios' });

    const existe = await Reserva.findOne({ fecha, hora, cancha: parseInt(cancha) });
    if (existe) return res.status(400).json({ error: 'Esa cancha ya está ocupada en ese horario' });

    const claveUnica = uuidv4();
    const reserva = await new Reserva({
      fecha, hora, cancha: parseInt(cancha), nombre, telefono,
      metodoPago: metodoPago || 'efectivo', claveUnica
    }).save();

    res.json({ ...reserva.toObject(), tipo: TIPO[parseInt(cancha)] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /admin/reserva  →  quitar turno cancelado
router.delete('/admin/reserva', async (req, res) => {
  try {
    const { claveUnica } = req.body;
    const deleted = await Reserva.findOneAndDelete({ claveUnica });
    if (!deleted) return res.status(404).json({ error: 'Reserva no encontrada' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
