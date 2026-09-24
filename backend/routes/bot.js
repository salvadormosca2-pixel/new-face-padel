const express    = require('express');
const router     = express.Router();
const { Op }     = require('sequelize');
const { getOrCreate } = require('./club');
const Torneo     = require('../models/Torneo');
const Profesor   = require('../models/Profesor');
const Premio     = require('../models/Premio');
const Socio      = require('../models/Socio');
const Producto   = require('../models/Producto');
const { calcDisponibilidad } = require('./reservas');
const { DEPORTES, DEPORTES_VALIDOS, ORIGENES, ORIGENES_VALIDOS, getEspacios, aFormaLegacy } = require('../lib/espacios');
const { METODOS, METODOS_INFO } = require('../lib/cuentas');

const { diasDesdeHoy } = require('../lib/fechas');

function fechaStr(offset) { return diasDesdeHoy(offset); }

/* Disponibilidad de un dia para todos los deportes, en las duraciones de cada uno. */
async function disponibilidadDelDia(fecha) {
  const salida = { fecha };
  for (const dep of DEPORTES_VALIDOS) {
    const porDuracion = {};
    for (const dur of DEPORTES[dep].duraciones) {
      porDuracion[`turnos_${dur}min`] = await calcDisponibilidad(fecha, dur, dep);
    }
    salida[dep] = porDuracion;
  }
  return salida;
}

router.get('/api/bot/contexto', async (_req, res) => {
  try {
    const hoy    = fechaStr(0);
    const manana = fechaStr(1);

    const [club, torneos, profesores, premios, ranking, espacios, productos, dispHoy, dispManana] = await Promise.all([
      getOrCreate(),
      Torneo.findAll({ where: { estado: { [Op.in]: ['inscripcion', 'grupos', 'bracket'] } }, order: [['fecha', 'ASC']], raw: true }),
      Profesor.findAll({ raw: true }),
      Premio.findAll({ where: { activo: true }, order: [['puntos', 'ASC']], raw: true }),
      Socio.findAll({ where: { activo: true }, order: [['puntos', 'DESC']], limit: 20, raw: true }),
      getEspacios(),
      Producto.findAll({ where: { activo: true }, order: [['orden', 'ASC']], raw: true }),
      disponibilidadDelDia(hoy),
      disponibilidadDelDia(manana)
    ]);

    const torneosResumen = torneos.map(t => ({
      id: t.id, nombre: t.nombre, fecha: t.fecha, estado: t.estado, descripcion: t.descripcion,
      parejasInscriptas: (t.inscripciones || []).filter(i => i.estadoInscripcion === 'aceptada').length
    }));

    const profesoresResumen = profesores.map(p => ({
      id: p.id, nombre: p.nombre, especialidad: p.especialidad, experiencia: p.experiencia,
      horarios: p.horarios, whatsapp: p.whatsapp, rating: p.rating,
      gruposEdad: p.gruposEdad, niveles: p.niveles
    }));

    const rankingResumen = ranking.map((s, i) => ({
      posicion: i + 1, nombre: s.nombre, telefono: s.telefono,
      puntos: s.puntos, totalGastado: s.totalGastado || 0
    }));

    res.json({
      club,
      torneos_activos: torneosResumen,
      profesores: profesoresResumen,
      premios,
      ranking: rankingResumen,

      /* Que se puede jugar y donde */
      deportes: DEPORTES_VALIDOS.map(d => ({
        id: d, ...DEPORTES[d],
        espacios: espacios.filter(e => e.deporte === d).map(aFormaLegacy)
      })).filter(d => d.espacios.length > 0),
      canchas: espacios.map(aFormaLegacy),

      /* Como puede entrar una reserva: el bot manda origen=whatsapp al reservar */
      origenes: ORIGENES_VALIDOS.map(o => ({ id: o, ...ORIGENES[o] })),
      origen_del_bot: 'whatsapp',

      metodos_pago: METODOS.map(m => ({ id: m, ...METODOS_INFO[m] })),

      buffet: productos.map(p => ({
        id: p.id, nombre: p.nombre, categoria: p.categoria, emoji: p.emoji,
        precio: p.precio, disponible: !p.controlaStock || p.stock > 0
      })),

      horarios_hoy: dispHoy,
      horarios_manana: dispManana
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* Catalogo del buffet para el bot (precios al publico, sin stock ni costos). */
router.get('/api/buffet', async (_req, res) => {
  try {
    const productos = await Producto.findAll({ where: { activo: true }, order: [['orden', 'ASC']], raw: true });
    res.json(productos.map(p => ({
      id: p.id, nombre: p.nombre, categoria: p.categoria, emoji: p.emoji,
      descripcion: p.descripcion || '',
      precio: p.precio, disponible: !p.controlaStock || p.stock > 0
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/ranking', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const socios = await Socio.findAll({
      where: { activo: true, puntos: { [Op.gt]: 0 } },
      order: [['puntos', 'DESC']], limit, raw: true
    });
    res.json(socios.map((s, i) => ({
      posicion: i + 1, nombre: s.nombre, telefono: s.telefono,
      puntos: s.puntos, totalGastado: s.totalGastado || 0, ultimaReserva: s.ultimaReserva
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/puntos/:telefono', async (req, res) => {
  try {
    const socio = await Socio.findOne({ where: { telefono: req.params.telefono }, raw: true });
    if (!socio) return res.status(404).json({ error: 'No se encontro un socio con ese telefono' });
    res.json({
      nombre: socio.nombre, telefono: socio.telefono, puntos: socio.puntos,
      totalGastado: socio.totalGastado || 0, activo: socio.activo
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
