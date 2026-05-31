const express = require('express');
const router  = express.Router();
const Premio  = require('../models/Premio');
const Canje   = require('../models/Canje');
const Socio   = require('../models/Socio');
const sequelize = require('../db');

// ── Públicos ──

router.get('/api/premios', async (_req, res) => {
  try {
    const premios = await Premio.findAll({ where: { activo: true }, order: [['puntos', 'ASC']], raw: true });
    res.json(premios);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/premios/canjear', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { telefono, premioId } = req.body;
    if (!telefono || !premioId) {
      await t.rollback();
      return res.status(400).json({ error: 'telefono y premioId son requeridos' });
    }

    const id = parseInt(premioId);
    if (isNaN(id)) {
      await t.rollback();
      return res.status(400).json({ error: 'premioId inválido' });
    }

    const premio = await Premio.findByPk(id, { transaction: t });
    if (!premio || !premio.activo) {
      await t.rollback();
      return res.status(404).json({ error: 'Premio no disponible' });
    }

    if (premio.stock !== -1 && premio.stock <= 0) {
      await t.rollback();
      return res.status(400).json({ error: 'Premio sin stock' });
    }

    const socio = await Socio.findOne({ where: { telefono }, transaction: t, lock: t.LOCK.UPDATE });
    if (!socio) {
      await t.rollback();
      return res.status(404).json({ error: 'No encontramos una cuenta con ese teléfono' });
    }

    if (socio.puntos < premio.puntos) {
      await t.rollback();
      return res.status(400).json({
        error: 'Puntos insuficientes',
        puntosActuales: socio.puntos,
        puntosNecesarios: premio.puntos,
        faltan: premio.puntos - socio.puntos
      });
    }

    await socio.update({ puntos: socio.puntos - premio.puntos }, { transaction: t });

    if (premio.stock !== -1) {
      await premio.update({ stock: premio.stock - 1 }, { transaction: t });
    }

    const canje = await Canje.create({
      socioTelefono: telefono,
      socioNombre: socio.nombre,
      premioId: premio.id,
      premioNombre: premio.nombre,
      puntosUsados: premio.puntos
    }, { transaction: t });

    await t.commit();

    res.json({
      ok: true,
      canje: {
        id: canje.id,
        premio: premio.nombre,
        puntosUsados: premio.puntos,
        puntosRestantes: socio.puntos,
        estado: canje.estado
      }
    });
  } catch (err) {
    await t.rollback();
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/premios/mis-canjes/:telefono', async (req, res) => {
  try {
    const canjes = await Canje.findAll({
      where: { socioTelefono: req.params.telefono },
      order: [['createdAt', 'DESC']],
      raw: true
    });
    res.json(canjes);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin ──

router.get('/api/admin/premios', async (_req, res) => {
  try {
    const premios = await Premio.findAll({ order: [['createdAt', 'DESC']], raw: true });
    res.json(premios);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/admin/premios', async (req, res) => {
  try {
    const { nombre, descripcion, icono, puntos, stock } = req.body;
    if (!nombre || !puntos) return res.status(400).json({ error: 'nombre y puntos son obligatorios' });
    const premio = await Premio.create({ nombre, descripcion, icono, puntos, stock });
    res.json(premio);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/api/admin/premios/:id', async (req, res) => {
  try {
    const premio = await Premio.findByPk(req.params.id);
    if (!premio) return res.status(404).json({ error: 'Premio no encontrado' });
    await premio.update(req.body);
    res.json(premio);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/admin/premios/:id', async (req, res) => {
  try {
    const premio = await Premio.findByPk(req.params.id);
    if (!premio) return res.status(404).json({ error: 'Premio no encontrado' });
    await premio.destroy();
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/admin/canjes', async (req, res) => {
  try {
    const { estado } = req.query;
    const where = estado ? { estado } : {};
    const canjes = await Canje.findAll({ where, order: [['createdAt', 'DESC']], raw: true });
    res.json(canjes);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/api/admin/canjes/:id', async (req, res) => {
  try {
    const canje = await Canje.findByPk(req.params.id);
    if (!canje) return res.status(404).json({ error: 'Canje no encontrado' });
    await canje.update({ estado: req.body.estado });
    res.json(canje);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
