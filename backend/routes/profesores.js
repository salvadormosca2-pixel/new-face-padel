const express  = require('express');
const router   = express.Router();
const Profesor = require('../models/Profesor');

// GET /profesores  →  lista pública
router.get('/profesores', async (req, res) => {
  try {
    const profesores = await Profesor.find().sort({ createdAt: -1 });
    res.json(profesores);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /admin/profesores  →  agregar
router.post('/admin/profesores', async (req, res) => {
  try {
    const { nombre, especialidad, experiencia, horarios, whatsapp } = req.body;
    if (!nombre || !especialidad || !horarios || !whatsapp)
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    const profesor = await new Profesor(req.body).save();
    res.json(profesor);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /admin/profesores/:id  →  editar
router.patch('/admin/profesores/:id', async (req, res) => {
  try {
    const profesor = await Profesor.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!profesor) return res.status(404).json({ error: 'Profesor no encontrado' });
    res.json(profesor);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /admin/profesores/:id  →  quitar
router.delete('/admin/profesores/:id', async (req, res) => {
  try {
    await Profesor.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
