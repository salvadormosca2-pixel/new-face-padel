const express    = require('express');
const router     = express.Router();
const { Op }     = require('sequelize');
const { getOrCreate } = require('./club');
const Torneo     = require('../models/Torneo');
const Profesor   = require('../models/Profesor');
const Premio     = require('../models/Premio');
const Socio      = require('../models/Socio');
const { calcDisponibilidad, CANCHAS } = require('./reservas');

function fechaStr(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

router.get('/api/bot/contexto', async (_req, res) => {
  try {
    const hoy    = fechaStr(0);
    const manana = fechaStr(1);

    const [club, torneos, profesores, premios, dispHoy, dispManana, ranking] = await Promise.all([
      getOrCreate(),
      Torneo.findAll({
        where: { estado: { [Op.in]: ['inscripcion', 'grupos', 'bracket'] } },
        order: [['fecha', 'ASC']],
        raw: true
      }),
      Profesor.findAll({ raw: true }),
      Premio.findAll({ where: { activo: true }, order: [['puntos', 'ASC']], raw: true }),
      calcDisponibilidad(hoy, 60),
      calcDisponibilidad(manana, 60),
      Socio.findAll({ where: { activo: true }, order: [['puntos', 'DESC']], limit: 20, raw: true })
    ]);

    const torneosResumen = torneos.map(t => ({
      id: t.id,
      nombre: t.nombre,
      fecha: t.fecha,
      estado: t.estado,
      descripcion: t.descripcion,
      parejasInscriptas: (t.inscripciones || []).filter(i => i.estadoInscripcion === 'aceptada').length
    }));

    const profesoresResumen = profesores.map(p => ({
      id: p.id,
      nombre: p.nombre,
      especialidad: p.especialidad,
      experiencia: p.experiencia,
      horarios: p.horarios,
      whatsapp: p.whatsapp,
      rating: p.rating,
      gruposEdad: p.gruposEdad,
      niveles: p.niveles
    }));

    const rankingResumen = ranking.map((s, i) => ({
      posicion: i + 1,
      nombre: s.nombre,
      telefono: s.telefono,
      puntos: s.puntos,
      totalGastado: s.totalGastado || 0
    }));

    res.json({
      club,
      torneos_activos: torneosResumen,
      profesores: profesoresResumen,
      premios,
      ranking: rankingResumen,
      canchas: CANCHAS,
      horarios_hoy: { fecha: hoy, slots: dispHoy },
      horarios_manana: { fecha: manana, slots: dispManana }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Endpoint individual para ranking
router.get('/api/ranking', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const socios = await Socio.findAll({
      where: { activo: true, puntos: { [Op.gt]: 0 } },
      order: [['puntos', 'DESC']],
      limit,
      raw: true
    });
    res.json(socios.map((s, i) => ({
      posicion: i + 1,
      nombre: s.nombre,
      telefono: s.telefono,
      puntos: s.puntos,
      totalGastado: s.totalGastado || 0,
      ultimaReserva: s.ultimaReserva
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Endpoint individual de puntos por telefono
router.get('/api/puntos/:telefono', async (req, res) => {
  try {
    const socio = await Socio.findOne({ where: { telefono: req.params.telefono }, raw: true });
    if (!socio) return res.status(404).json({ error: 'No se encontro un socio con ese telefono' });
    res.json({
      nombre: socio.nombre,
      telefono: socio.telefono,
      puntos: socio.puntos,
      totalGastado: socio.totalGastado || 0,
      activo: socio.activo
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
