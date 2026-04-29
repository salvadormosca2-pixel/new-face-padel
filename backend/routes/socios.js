const express = require('express');
const router  = express.Router();
const Socio   = require('../models/Socio');

// GET /admin/socios  →  lista completa
router.get('/admin/socios', async (req, res) => {
  try {
    const socios = await Socio.find().sort({ createdAt: -1 });
    res.json(socios);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /socios/:telefono  →  consulta pública de puntos
router.get('/socios/:telefono', async (req, res) => {
  try {
    const socio = await Socio.findOne({ telefono: req.params.telefono });
    if (!socio) return res.status(404).json({ error: 'Socio no encontrado' });
    res.json({ nombre: socio.nombre, puntos: socio.puntos, activo: socio.activo });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /admin/socios/:id/puntos  →  ajuste manual de puntos
router.patch('/admin/socios/:id/puntos', async (req, res) => {
  try {
    const socio = await Socio.findByIdAndUpdate(
      req.params.id,
      { $inc: { puntos: req.body.puntos } },
      { new: true }
    );
    if (!socio) return res.status(404).json({ error: 'Socio no encontrado' });
    res.json(socio);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /admin/socios/:id
router.patch('/admin/socios/:id', async (req, res) => {
  try {
    const socio = await Socio.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!socio) return res.status(404).json({ error: 'Socio no encontrado' });
    res.json(socio);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
