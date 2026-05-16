const express = require('express');
const router  = express.Router();
const Socio   = require('../models/Socio');

router.get('/api/admin/socios', async (req, res) => {
  try {
    const socios = await Socio.find().sort({ createdAt: -1 }).lean();
    res.json(socios);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/socios/:telefono', async (req, res) => {
  try {
    const socio = await Socio.findOne({ telefono: req.params.telefono }).lean();
    if (!socio) return res.status(404).json({ error: 'Socio no encontrado' });
    res.json({ nombre: socio.nombre, puntos: socio.puntos, activo: socio.activo });
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
