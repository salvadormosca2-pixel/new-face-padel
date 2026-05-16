const express  = require('express');
const router   = express.Router();
const Profesor = require('../models/Profesor');

router.get('/api/profesores', async (req, res) => {
  try {
    const profesores = await Profesor.find().sort({ createdAt: -1 }).lean();
    res.json(profesores);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/admin/profesores', async (req, res) => {
  try {
    const { nombre, especialidad, experiencia, horarios, whatsapp, imagen, alumnos, rating, gruposEdad, niveles } = req.body;
    if (!nombre || !especialidad || !horarios || !whatsapp)
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    const profesor = await new Profesor({ nombre, especialidad, experiencia, horarios, whatsapp, imagen, alumnos, rating, gruposEdad, niveles }).save();
    res.json(profesor);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/api/admin/profesores/:id', async (req, res) => {
  try {
    const profesor = await Profesor.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).lean();
    if (!profesor) return res.status(404).json({ error: 'Profesor no encontrado' });
    res.json(profesor);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/admin/profesores/:id', async (req, res) => {
  try {
    const deleted = await Profesor.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Profesor no encontrado' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
