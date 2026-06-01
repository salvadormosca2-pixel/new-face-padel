const express = require('express');
const router  = express.Router();
const { Op }  = require('sequelize');
const Socio   = require('../models/Socio');
const Reserva = require('../models/Reserva');
const Premio  = require('../models/Premio');

const TIPO_CANCHA = { 1: 'Cubierta', 2: 'Cubierta', 3: 'Al aire libre', 4: 'Al aire libre' };

router.get('/api/admin/socios', async (req, res) => {
  try {
    const socios = await Socio.findAll({ order: [['createdAt', 'DESC']], raw: true });
    res.json(socios);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/socios/:telefono', async (req, res) => {
  try {
    const socio = await Socio.findOne({ where: { telefono: req.params.telefono }, raw: true });
    if (!socio) return res.status(404).json({ error: 'Socio no encontrado' });

    const hoy = new Date().toISOString().split('T')[0];

    const [totalReservas, proximaReserva, premiosActivos] = await Promise.all([
      Reserva.count({ where: { cliente_telefono: req.params.telefono } }),
      Reserva.findOne({
        where: { cliente_telefono: req.params.telefono, fecha: { [Op.gte]: hoy }, estado_reserva: 'confirmada' },
        order: [['fecha', 'ASC'], ['hora_inicio', 'ASC']],
        raw: true
      }),
      Premio.findAll({ where: { activo: true }, order: [['puntos', 'ASC']], raw: true })
    ]);

    const premiosCanjeables = premiosActivos
      .filter(p => p.puntos <= socio.puntos)
      .map(p => ({ id: p.id, nombre: p.nombre, puntos: p.puntos }));

    const proximoPremio = premiosActivos.find(p => p.puntos > socio.puntos);

    res.json({
      nombre: socio.nombre,
      telefono: socio.telefono,
      puntos: socio.puntos,
      totalGastado: socio.totalGastado || 0,
      reservasTotales: totalReservas,
      ultimaReserva: socio.ultimaReserva,
      activo: socio.activo,
      proximaReserva: proximaReserva ? {
        fecha: proximaReserva.fecha,
        hora_inicio: proximaReserva.hora_inicio,
        hora_fin: proximaReserva.hora_fin,
        cancha: proximaReserva.cancha_id,
        tipo: TIPO_CANCHA[proximaReserva.cancha_id],
        claveUnica: proximaReserva.claveUnica
      } : null,
      premiosCanjeables,
      proximoPremio: proximoPremio ? {
        nombre: proximoPremio.nombre,
        puntosNecesarios: proximoPremio.puntos,
        puntosFaltan: proximoPremio.puntos - socio.puntos
      } : null
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/api/admin/socios/:id/puntos', async (req, res) => {
  try {
    const puntos = parseInt(req.body.puntos);
    if (isNaN(puntos)) return res.status(400).json({ error: 'Puntos debe ser un número' });
    const socio = await Socio.findByPk(req.params.id);
    if (!socio) return res.status(404).json({ error: 'Socio no encontrado' });
    await socio.update({ puntos: socio.puntos + puntos });
    res.json(socio);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/api/admin/socios/:id', async (req, res) => {
  try {
    const socio = await Socio.findByPk(req.params.id);
    if (!socio) return res.status(404).json({ error: 'Socio no encontrado' });
    await socio.update(req.body);
    res.json(socio);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
