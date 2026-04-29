const express = require('express');
const router  = express.Router();
const Torneo  = require('../models/Torneo');
const Socio   = require('../models/Socio');

// GET /torneos  →  todos los torneos (público)
router.get('/torneos', async (req, res) => {
  try {
    const torneos = await Torneo.find().sort({ createdAt: -1 });
    res.json(torneos);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /torneos/:id  →  detalle de torneo (público)
router.get('/torneos/:id', async (req, res) => {
  try {
    const torneo = await Torneo.findById(req.params.id);
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });
    res.json(torneo);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /admin/torneos  →  crear torneo
router.post('/admin/torneos', async (req, res) => {
  try {
    const { nombre, fecha } = req.body;
    if (!nombre || !fecha) return res.status(400).json({ error: 'Nombre y fecha son obligatorios' });
    const torneo = await new Torneo({ nombre, fecha }).save();
    res.json(torneo);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /admin/torneos/:id
router.delete('/admin/torneos/:id', async (req, res) => {
  try {
    await Torneo.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /admin/torneos/:id/inscribir  →  inscribir jugador a un grupo
router.post('/admin/torneos/:id/inscribir', async (req, res) => {
  try {
    const { jugador, grupo, telefono } = req.body;
    if (!jugador) return res.status(400).json({ error: 'Nombre del jugador requerido' });

    const torneo = await Torneo.findById(req.params.id);
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });

    const g = ['A','B','C','D'].includes(grupo) ? grupo : 'A';
    torneo.grupos[g].push({ jugador, victorias: 0, derrotas: 0, puntos: 0 });
    torneo.cantidadJugadores += 1;
    await torneo.save();

    // Sumar 50 puntos al socio por inscripción
    if (telefono) {
      await Socio.findOneAndUpdate(
        { telefono },
        { $setOnInsert: { nombre: jugador }, $inc: { puntos: 50 } },
        { upsert: true }
      );
    }

    res.json(torneo);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /admin/torneos/:id/partido  →  agregar partido
router.post('/admin/torneos/:id/partido', async (req, res) => {
  try {
    const { jugador1, jugador2, fase, grupo } = req.body;
    const torneo = await Torneo.findById(req.params.id);
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });
    torneo.partidos.push({ jugador1, jugador2, fase: fase || 'grupo', grupo: grupo || null });
    await torneo.save();
    res.json(torneo);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /admin/torneos/:id/resultado  →  cargar resultado de partido
router.patch('/admin/torneos/:id/resultado', async (req, res) => {
  try {
    const { partidoId, resultado, ganador } = req.body;
    const torneo = await Torneo.findById(req.params.id);
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });

    const partido = torneo.partidos.id(partidoId);
    if (!partido) return res.status(404).json({ error: 'Partido no encontrado' });

    partido.resultado = resultado;
    partido.ganador   = ganador;

    // Actualizar tabla si es partido de grupo
    if (partido.fase === 'grupo' && partido.grupo) {
      const grupo = torneo.grupos[partido.grupo];
      const j1 = grupo.find(j => j.jugador === partido.jugador1);
      const j2 = grupo.find(j => j.jugador === partido.jugador2);
      if (j1 && j2) {
        if (ganador === partido.jugador1) { j1.victorias++; j1.puntos += 3; j2.derrotas++; }
        else                              { j2.victorias++; j2.puntos += 3; j1.derrotas++; }
      }
    }

    // Si es el partido final, coronar campeón
    if (partido.fase === 'final' && ganador) {
      torneo.campeon = ganador;
      torneo.estado  = 'finalizado';
    }

    await torneo.save();
    res.json(torneo);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /admin/torneos/:id/estado
router.patch('/admin/torneos/:id/estado', async (req, res) => {
  try {
    const { estado, campeon } = req.body;
    const update = { estado };
    if (campeon) update.campeon = campeon;
    const torneo = await Torneo.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });
    res.json(torneo);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
