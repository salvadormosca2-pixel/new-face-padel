const express = require('express');
const router  = express.Router();
const Torneo  = require('../models/Torneo');

router.get('/api/torneos', async (req, res) => {
  try {
    const torneos = await Torneo.find().sort({ createdAt: -1 }).lean();
    res.json(torneos);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/torneos/:id', async (req, res) => {
  try {
    const torneo = await Torneo.findById(req.params.id).lean();
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });
    res.json(torneo);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/torneos/:id/inscripcion', async (req, res) => {
  try {
    const torneo = await Torneo.findById(req.params.id);
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });
    if (torneo.estado !== 'inscripcion') return res.status(400).json({ error: 'El torneo ya no acepta inscripciones' });

    const { jugador1, jugador2 } = req.body;
    if (!jugador1?.nombre || !jugador2?.nombre) return res.status(400).json({ error: 'Datos de jugadores requeridos' });

    const id = 'insc-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
    const nombrePareja = `${jugador1.nombre.split(' ').pop()} / ${jugador2.nombre.split(' ').pop()}`;
    const nueva = { id, jugador1, jugador2, nombrePareja, estadoInscripcion: 'pendiente' };

    if (!Array.isArray(torneo.inscripciones)) torneo.inscripciones = [];
    torneo.inscripciones.push(nueva);
    torneo.markModified('inscripciones');
    await torneo.save();

    res.json({ ok: true, inscripcion: nueva });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/admin/torneos', async (req, res) => {
  try {
    const { nombre, fecha, descripcion, imagen } = req.body;
    if (!nombre || !fecha) return res.status(400).json({ error: 'Nombre y fecha son obligatorios' });
    const torneo = await new Torneo({ nombre, fecha, descripcion, imagen }).save();
    res.json(torneo);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/api/admin/torneos/:id', async (req, res) => {
  try {
    const torneo = await Torneo.findById(req.params.id);
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });

    const fields = ['nombre', 'fecha', 'descripcion', 'imagen', 'estado', 'campeon', 'cantidadJugadores'];
    fields.forEach(f => { if (req.body[f] !== undefined) torneo[f] = req.body[f]; });

    const mixed = ['inscripciones', 'grupos', 'bracket'];
    mixed.forEach(f => {
      if (req.body[f] !== undefined) { torneo[f] = req.body[f]; torneo.markModified(f); }
    });

    await torneo.save();
    res.json(torneo);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/admin/torneos/:id', async (req, res) => {
  try {
    const deleted = await Torneo.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Torneo no encontrado' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
