const express  = require('express');
const router   = express.Router();
const Profesor = require('../models/Profesor');

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/api/profesores', async (req, res) => {
  try {
    const filtro = {};
    if (req.query.nivel) {
      filtro.niveles = { $regex: new RegExp(escapeRegex(req.query.nivel), 'i') };
    }
    if (req.query.edad) {
      filtro.gruposEdad = { $regex: new RegExp(escapeRegex(req.query.edad), 'i') };
    }
    if (req.query.nombre) {
      filtro.nombre = { $regex: new RegExp(escapeRegex(req.query.nombre), 'i') };
    }
    if (req.query.especialidad) {
      filtro.especialidad = { $regex: new RegExp(escapeRegex(req.query.especialidad), 'i') };
    }

    const profesores = await Profesor.find(filtro).sort({ rating: -1 }).lean();
    res.json(profesores);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/profesores/:id', async (req, res) => {
  try {
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const profesor = await Profesor.findById(req.params.id).lean();
    if (!profesor) return res.status(404).json({ error: 'Profesor no encontrado' });
    res.json(profesor);
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
