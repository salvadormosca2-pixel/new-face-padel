const express = require('express');
const router  = express.Router();
const Socio   = require('../models/Socio');
const Reserva = require('../models/Reserva');
const Premio  = require('../models/Premio');

router.get('/api/admin/socios', async (req, res) => {
  try {
    const socios = await Socio.find().sort({ createdAt: -1 }).lean();
    res.json(socios);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const TIPO_CANCHA = { 1: 'Cubierta', 2: 'Cubierta', 3: 'Al aire libre', 4: 'Al aire libre' };

router.get('/api/socios/:telefono', async (req, res) => {
  try {
    const socio = await Socio.findOne({ telefono: req.params.telefono }).lean();
    if (!socio) return res.status(404).json({ error: 'Socio no encontrado' });

    const hoy = new Date().toISOString().split('T')[0];

    const [totalReservas, proximaReserva, premiosActivos] = await Promise.all([
      Reserva.countDocuments({ telefono: req.params.telefono }),
      Reserva.findOne({ telefono: req.params.telefono, fecha: { $gte: hoy } })
        .sort({ fecha: 1, hora: 1 }).lean(),
      Premio.find({ activo: true }).sort({ puntos: 1 }).lean()
    ]);

    const premiosCanjeables = premiosActivos
      .filter(p => p.puntos <= socio.puntos)
      .map(p => ({ id: p._id, nombre: p.nombre, puntos: p.puntos }));

    const proximoPremio = premiosActivos.find(p => p.puntos > socio.puntos);

    const resp = {
      nombre: socio.nombre,
      telefono: socio.telefono,
      puntos: socio.puntos,
      totalGastado: socio.totalGastado || 0,
      reservasTotales: totalReservas,
      ultimaReserva: socio.ultimaReserva,
      activo: socio.activo,
      proximaReserva: proximaReserva ? {
        fecha: proximaReserva.fecha,
        hora: proximaReserva.hora,
        cancha: proximaReserva.cancha,
        tipo: TIPO_CANCHA[proximaReserva.cancha],
        claveUnica: proximaReserva.claveUnica
      } : null,
      premiosCanjeables,
      proximoPremio: proximoPremio ? {
        nombre: proximoPremio.nombre,
        puntosNecesarios: proximoPremio.puntos,
        puntosFaltan: proximoPremio.puntos - socio.puntos
      } : null
    };

    res.json(resp);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/api/admin/socios/:id/puntos', async (req, res) => {
  try {
    const puntos = parseInt(req.body.puntos);
    if (isNaN(puntos)) return res.status(400).json({ error: 'Puntos debe ser un número' });
    const socio = await Socio.findByIdAndUpdate(
      req.params.id,
      { $inc: { puntos } },
      { new: true }
    ).lean();
    if (!socio) return res.status(404).json({ error: 'Socio no encontrado' });
    res.json(socio);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/api/admin/socios/:id', async (req, res) => {
  try {
    const socio = await Socio.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).lean();
    if (!socio) return res.status(404).json({ error: 'Socio no encontrado' });
    res.json(socio);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
