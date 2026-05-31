const express = require('express');
const router  = express.Router();
const Torneo  = require('../models/Torneo');

router.get('/api/torneos', async (req, res) => {
  try {
    const torneos = await Torneo.find().sort({ createdAt: -1 }).lean();
    res.json(torneos);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/torneos/proximos', async (_req, res) => {
  try {
    const torneos = await Torneo.find({
      estado: { $in: ['inscripcion', 'grupos', 'bracket'] }
    }).sort({ fecha: 1 }).lean();

    res.json(torneos.map(t => ({
      id: t._id,
      nombre: t.nombre,
      fecha: t.fecha,
      descripcion: t.descripcion,
      estado: t.estado,
      parejasInscriptas: (t.inscripciones || []).filter(i => i.estadoInscripcion === 'aceptada').length
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/torneos/mi-progreso/:telefono', async (req, res) => {
  try {
    const tel = req.params.telefono;
    const torneos = await Torneo.find({
      estado: { $in: ['inscripcion', 'grupos', 'bracket', 'finalizado'] }
    }).sort({ fecha: -1 }).lean();

    const resultados = [];

    for (const t of torneos) {
      const inscripciones = t.inscripciones || [];
      const miInscripcion = inscripciones.find(i =>
        i.jugador1?.telefono === tel || i.jugador2?.telefono === tel
      );
      if (!miInscripcion) continue;

      const entry = {
        torneoId: t._id,
        torneo: t.nombre,
        fecha: t.fecha,
        estadoTorneo: t.estado,
        inscripcion: {
          pareja: miInscripcion.nombrePareja,
          jugador1: miInscripcion.jugador1?.nombre,
          jugador2: miInscripcion.jugador2?.nombre,
          estadoInscripcion: miInscripcion.estadoInscripcion
        },
        grupo: null,
        bracket: null,
        campeon: false
      };

      const parejaId = miInscripcion.id;

      if (t.grupos && typeof t.grupos === 'object') {
        for (const [letra, grupo] of Object.entries(t.grupos)) {
          if (!grupo.tabla) continue;
          const pos = grupo.tabla.findIndex(row => row.parejaId === parejaId);
          if (pos === -1) continue;

          const row = grupo.tabla[pos];
          const partidos = (grupo.partidos || []).filter(
            p => p.pareja1 === parejaId || p.pareja2 === parejaId
          );

          entry.grupo = {
            letra,
            posicion: pos + 1,
            victorias: row.V || 0,
            derrotas: row.D || 0,
            setsGanados: row.SG || 0,
            setsPerdidos: row.SP || 0,
            puntos: row.Pts || 0,
            clasificado: pos < 2,
            partidos: partidos.map(p => {
              const rivalId = p.pareja1 === parejaId ? p.pareja2 : p.pareja1;
              const rival = inscripciones.find(i => i.id === rivalId);
              return {
                rival: rival?.nombrePareja || rivalId,
                resultado: p.resultado || 'Pendiente',
                ganado: p.ganador === parejaId,
                hora: p.hora || null
              };
            })
          };
          break;
        }
      }

      if (t.bracket && Array.isArray(t.bracket)) {
        const misPartidos = t.bracket.filter(
          p => p.pareja1 === parejaId || p.pareja2 === parejaId
        );

        if (misPartidos.length > 0) {
          const jugados = misPartidos.filter(p => p.ganador);
          const pendiente = misPartidos.find(p => !p.ganador && p.pareja1 && p.pareja2);
          const ultimoJugado = jugados[jugados.length - 1];

          const faseOrden = { cuartos: 1, semifinal: 2, final: 3 };
          let faseActual = 'cuartos';
          misPartidos.forEach(p => {
            if ((faseOrden[p.fase] || 0) > (faseOrden[faseActual] || 0)) faseActual = p.fase;
          });

          entry.bracket = {
            faseActual,
            historial: jugados.map(p => {
              const rivalId = p.pareja1 === parejaId ? p.pareja2 : p.pareja1;
              const rival = inscripciones.find(i => i.id === rivalId);
              return {
                fase: p.fase,
                rival: rival?.nombrePareja || rivalId,
                resultado: p.resultado || '',
                ganado: p.ganador === parejaId
              };
            }),
            proximoPartido: pendiente ? (() => {
              const rivalId = pendiente.pareja1 === parejaId ? pendiente.pareja2 : pendiente.pareja1;
              const rival = inscripciones.find(i => i.id === rivalId);
              return {
                fase: pendiente.fase,
                rival: rival?.nombrePareja || rivalId,
                hora: pendiente.hora || null
              };
            })() : null,
            eliminado: ultimoJugado ? ultimoJugado.ganador !== parejaId : false
          };
        }
      }

      if (t.campeon === parejaId) entry.campeon = true;

      resultados.push(entry);
    }

    if (!resultados.length) {
      return res.json({ mensaje: 'No estás inscripto en ningún torneo activo', torneos: [] });
    }

    res.json({ torneos: resultados });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/torneos/:id', async (req, res) => {
  try {
    const torneo = await Torneo.findById(req.params.id).lean();
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });
    res.json(torneo);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/torneos/:id/inscripcion', async (req, res) => {
  try {
    const torneo = await Torneo.findById(req.params.id);
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });
    if (torneo.estado !== 'inscripcion') return res.status(400).json({ error: 'El torneo ya no acepta inscripciones' });

    const { jugador1, jugador2 } = req.body;
    if (!jugador1?.nombre || !jugador2?.nombre) return res.status(400).json({ error: 'Datos de jugadores requeridos' });

    const id = 'insc-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
    const nombrePareja = `${jugador1.nombre.split(' ').pop()} / ${jugador2.nombre.split(' ').pop()}`;
    const nueva = { id, jugador1, jugador2, nombrePareja, estadoInscripcion: 'pendiente' };

    if (!Array.isArray(torneo.inscripciones)) torneo.inscripciones = [];
    torneo.inscripciones.push(nueva);
    torneo.markModified('inscripciones');
    await torneo.save();

    res.json({ ok: true, inscripcion: nueva });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/admin/torneos', async (req, res) => {
  try {
    const { nombre, fecha, descripcion, imagen } = req.body;
    if (!nombre || !fecha) return res.status(400).json({ error: 'Nombre y fecha son obligatorios' });
    const torneo = await new Torneo({ nombre, fecha, descripcion, imagen }).save();
    res.json(torneo);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/api/admin/torneos/:id', async (req, res) => {
  try {
    const torneo = await Torneo.findById(req.params.id);
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });

    const fields = ['nombre', 'fecha', 'descripcion', 'imagen', 'estado', 'campeon', 'cantidadJugadores'];
    fields.forEach(f => { if (req.body[f] !== undefined) torneo[f] = req.body[f]; });

    const mixed = ['inscripciones', 'grupos', 'bracket'];
    mixed.forEach(f => {
      if (req.body[f] !== undefined) { torneo[f] = req.body[f]; torneo.markModified(f); }
    });

    await torneo.save();
    res.json(torneo);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/admin/torneos/:id', async (req, res) => {
  try {
    const deleted = await Torneo.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Torneo no encontrado' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
