const express  = require('express');
const router   = express.Router();
const mongoose = require('mongoose');
const Premio   = require('../models/Premio');
const Canje    = require('../models/Canje');
const Socio    = require('../models/Socio');

// ── Públicos ──

router.get('/api/premios', async (_req, res) => {
  try {
    const premios = await Premio.find({ activo: true }).sort({ puntos: 1 }).lean();
    res.json(premios);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/premios/canjear', async (req, res) => {
  try {
    const { telefono, premioId } = req.body;
    if (!telefono || !premioId) return res.status(400).json({ error: 'telefono y premioId son requeridos' });

    if (!mongoose.Types.ObjectId.isValid(premioId)) {
      return res.status(400).json({ error: 'premioId inválido' });
    }

    const premio = await Premio.findById(premioId);
    if (!premio || !premio.activo) return res.status(404).json({ error: 'Premio no disponible' });

    if (premio.stock !== -1 && premio.stock <= 0) {
      return res.status(400).json({ error: 'Premio sin stock' });
    }

    const socio = await Socio.findOneAndUpdate(
      { telefono, puntos: { $gte: premio.puntos } },
      { $inc: { puntos: -premio.puntos } },
      { new: true }
    );

    if (!socio) {
      const existe = await Socio.findOne({ telefono }).lean();
      if (!existe) return res.status(404).json({ error: 'No encontramos una cuenta con ese teléfono' });
      return res.status(400).json({
        error: 'Puntos insuficientes',
        puntosActuales: existe.puntos,
        puntosNecesarios: premio.puntos,
        faltan: premio.puntos - existe.puntos
      });
    }

    if (premio.stock !== -1) {
      await Premio.findByIdAndUpdate(premioId, { $inc: { stock: -1 } });
    }

    const canje = await new Canje({
      socioTelefono: telefono,
      socioNombre: socio.nombre,
      premioId: premio._id,
      premioNombre: premio.nombre,
      puntosUsados: premio.puntos
    }).save();

    res.json({
      ok: true,
      canje: {
        id: canje._id,
        premio: premio.nombre,
        puntosUsados: premio.puntos,
        puntosRestantes: socio.puntos,
        estado: canje.estado
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/premios/mis-canjes/:telefono', async (req, res) => {
  try {
    const canjes = await Canje.find({ socioTelefono: req.params.telefono })
      .sort({ createdAt: -1 }).lean();
    res.json(canjes);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin ──

router.get('/api/admin/premios', async (_req, res) => {
  try {
    const premios = await Premio.find().sort({ createdAt: -1 }).lean();
    res.json(premios);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/admin/premios', async (req, res) => {
  try {
    const { nombre, descripcion, icono, puntos, stock } = req.body;
    if (!nombre || !puntos) return res.status(400).json({ error: 'nombre y puntos son obligatorios' });
    const premio = await new Premio({ nombre, descripcion, icono, puntos, stock }).save();
    res.json(premio);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/api/admin/premios/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const premio = await Premio.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).lean();
    if (!premio) return res.status(404).json({ error: 'Premio no encontrado' });
    res.json(premio);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/admin/premios/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const deleted = await Premio.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Premio no encontrado' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/admin/canjes', async (req, res) => {
  try {
    const { estado } = req.query;
    const filtro = estado ? { estado } : {};
    const canjes = await Canje.find(filtro).sort({ createdAt: -1 }).lean();
    res.json(canjes);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/api/admin/canjes/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const canje = await Canje.findByIdAndUpdate(req.params.id, { estado: req.body.estado }, { new: true }).lean();
    if (!canje) return res.status(404).json({ error: 'Canje no encontrado' });
    res.json(canje);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
