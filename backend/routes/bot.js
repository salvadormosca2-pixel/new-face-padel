const express    = require('express');
const router     = express.Router();
const { getOrCreate } = require('./club');
const Torneo     = require('../models/Torneo');
const Profesor   = require('../models/Profesor');
const Premio     = require('../models/Premio');
const Reserva    = require('../models/Reserva');

const HORAS   = ['15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00','23:00'];
const CANCHAS = [1, 2, 3, 4];
const TIPO    = { 1: 'Cubierta', 2: 'Cubierta', 3: 'Al aire libre', 4: 'Al aire libre' };

function fechaStr(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

async function disponibilidadFecha(fecha) {
  const reservas = await Reserva.find({ fecha }).lean();
  return HORAS.map(hora => {
    const ocupadas = reservas.filter(r => r.hora === hora).map(r => r.cancha);
    const libres   = CANCHAS.filter(c => !ocupadas.includes(c));
    return {
      hora,
      libres: libres.length,
      total: 4,
      canchasLibres: libres.map(c => ({ cancha: c, tipo: TIPO[c] }))
    };
  });
}

router.get('/api/bot/contexto', async (_req, res) => {
  try {
    const hoy    = fechaStr(0);
    const manana = fechaStr(1);

    const [club, torneos, profesores, premios, dispHoy, dispManana] = await Promise.all([
      getOrCreate(),
      Torneo.find({ estado: { $in: ['inscripcion', 'grupos', 'bracket'] } }).sort({ fecha: 1 }).lean(),
      Profesor.find().lean(),
      Premio.find({ activo: true }).sort({ puntos: 1 }).lean(),
      disponibilidadFecha(hoy),
      disponibilidadFecha(manana)
    ]);

    const torneosResumen = torneos.map(t => ({
      id: t._id,
      nombre: t.nombre,
      fecha: t.fecha,
      estado: t.estado,
      descripcion: t.descripcion,
      parejasInscriptas: (t.inscripciones || []).filter(i => i.estadoInscripcion === 'aceptada').length
    }));

    const profesoresResumen = profesores.map(p => ({
      id: p._id,
      nombre: p.nombre,
      especialidad: p.especialidad,
      experiencia: p.experiencia,
      horarios: p.horarios,
      whatsapp: p.whatsapp,
      rating: p.rating,
      gruposEdad: p.gruposEdad,
      niveles: p.niveles
    }));

    res.json({
      club,
      torneos_activos: torneosResumen,
      profesores: profesoresResumen,
      premios,
      horarios_hoy: { fecha: hoy, slots: dispHoy },
      horarios_manana: { fecha: manana, slots: dispManana }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
