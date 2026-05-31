const express  = require('express');
const router   = express.Router();
const { Op }   = require('sequelize');
const Profesor = require('../models/Profesor');

router.get('/api/profesores', async (req, res) => {
  try {
    const where = {};
    if (req.query.nombre) {
      where.nombre = { [Op.iLike]: `%${req.query.nombre}%` };
    }
    if (req.query.especialidad) {
      where.especialidad = { [Op.iLike]: `%${req.query.especialidad}%` };
    }

    let profesores = await Profesor.findAll({ where, order: [['rating', 'DESC']], raw: true });

    if (req.query.nivel) {
      const nivel = req.query.nivel.toLowerCase();
      profesores = profesores.filter(p =>
        (p.niveles || []).some(n => n.toLowerCase().includes(nivel))
      );
    }
    if (req.query.edad) {
      const edad = req.query.edad.toLowerCase();
      profesores = profesores.filter(p =>
        (p.gruposEdad || []).some(g => g.toLowerCase().includes(edad))
      );
    }

    res.json(profesores);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/profesores/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
    const profesor = await Profesor.findByPk(id, { raw: true });
    if (!profesor) return res.status(404).json({ error: 'Profesor no encontrado' });
    res.json(profesor);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/admin/profesores', async (req, res) => {
  try {
    const { nombre, especialidad, experiencia, horarios, whatsapp, imagen, alumnos, rating, gruposEdad, niveles } = req.body;
    if (!nombre || !especialidad || !horarios || !whatsapp)
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    const profesor = await Profesor.create({ nombre, especialidad, experiencia, horarios, whatsapp, imagen, alumnos, rating, gruposEdad, niveles });
    res.json(profesor);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/api/admin/profesores/:id', async (req, res) => {
  try {
    const profesor = await Profesor.findByPk(req.params.id);
    if (!profesor) return res.status(404).json({ error: 'Profesor no encontrado' });
    await profesor.update(req.body);
    res.json(profesor);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/admin/profesores/:id', async (req, res) => {
  try {
    const profesor = await Profesor.findByPk(req.params.id);
    if (!profesor) return res.status(404).json({ error: 'Profesor no encontrado' });
    await profesor.destroy();
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
