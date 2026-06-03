const express = require('express');
const router  = express.Router();
const { Op }  = require('sequelize');
const Torneo  = require('../models/Torneo');

router.get('/api/torneos', async (req, res) => {
  try {
    const torneos = await Torneo.findAll({ order: [['createdAt', 'DESC']], raw: true });
    res.json(torneos);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/torneos/proximos', async (_req, res) => {
  try {
    const torneos = await Torneo.findAll({
      where: { estado: { [Op.in]: ['inscripcion', 'grupos', 'bracket'] } },
      order: [['fecha', 'ASC']],
      raw: true
    });
    res.json(torneos.map(t => ({
      id: t.id,
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
    const torneos = await Torneo.findAll({
      where: { estado: { [Op.in]: ['inscripcion', 'grupos', 'bracket', 'finalizado'] } },
      order: [['fecha', 'DESC']],
      raw: true
    });

    const resultados = [];

    for (const t of torneos) {
      const inscripciones = t.inscripciones || [];
      const miInscripcion = inscripciones.find(i =>
        i.jugador1?.telefono === tel || i.jugador2?.telefono === tel
      );
      if (!miInscripcion) continue;

      const entry = {
        torneoId: t.id,
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

router.get('/api/torneos/detalle', async (req, res) => {
  try {
    const id = parseInt(req.query.id || req.query.torneoId);
    if (!id) return res.status(400).json({ error: 'id es requerido (ej: ?id=1)' });
    const torneo = await Torneo.findByPk(id, { raw: true });
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });
    res.json(torneo);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

async function inscripcionHandler(req, res) {
  try {
    const data = { ...req.query, ...req.body };
    if (data.datos) {
      try { Object.assign(data, JSON.parse(data.datos)); } catch {}
    }
    const id = data.torneoId || data.torneo_id || data.id;
    if (!id) return res.status(400).json({ error: 'torneoId es requerido' });
    const torneo = await Torneo.findByPk(id);
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });
    if (torneo.estado !== 'inscripcion') return res.status(400).json({ error: 'El torneo ya no acepta inscripciones' });

    const jugador1 = data.jugador1 || {};
    const jugador2 = data.jugador2 || {};
    if (typeof jugador1 === 'string') try { Object.assign(jugador1, JSON.parse(data.jugador1)); } catch {}
    if (typeof jugador2 === 'string') try { Object.assign(jugador2, JSON.parse(data.jugador2)); } catch {}
    if (!jugador1.nombre || !jugador2.nombre) return res.status(400).json({ error: 'Datos de jugadores requeridos' });

    const inId = 'insc-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
    const nombrePareja = `${jugador1.nombre.split(' ').pop()} / ${jugador2.nombre.split(' ').pop()}`;
    const nueva = { id: inId, jugador1, jugador2, nombrePareja, estadoInscripcion: 'pendiente' };

    const inscripciones = Array.isArray(torneo.inscripciones) ? [...torneo.inscripciones] : [];
    inscripciones.push(nueva);
    await torneo.update({ inscripciones });

    res.json({ ok: true, inscripcion: nueva });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

router.get('/api/torneos/inscripcion', inscripcionHandler);
router.post('/api/torneos/inscripcion', inscripcionHandler);

router.get('/api/torneos/:id', async (req, res) => {
  try {
    const torneo = await Torneo.findByPk(req.params.id, { raw: true });
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });
    res.json(torneo);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/torneos/:id/inscripcion', async (req, res) => {
  try {
    const torneo = await Torneo.findByPk(req.params.id);
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });
    if (torneo.estado !== 'inscripcion') return res.status(400).json({ error: 'El torneo ya no acepta inscripciones' });

    const { jugador1, jugador2 } = req.body;
    if (!jugador1?.nombre || !jugador2?.nombre) return res.status(400).json({ error: 'Datos de jugadores requeridos' });

    const id = 'insc-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
    const nombrePareja = `${jugador1.nombre.split(' ').pop()} / ${jugador2.nombre.split(' ').pop()}`;
    const nueva = { id, jugador1, jugador2, nombrePareja, estadoInscripcion: 'pendiente' };

    const inscripciones = Array.isArray(torneo.inscripciones) ? [...torneo.inscripciones] : [];
    inscripciones.push(nueva);
    await torneo.update({ inscripciones });

    res.json({ ok: true, inscripcion: nueva });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/admin/torneos', async (req, res) => {
  try {
    const { nombre, fecha, descripcion, imagen } = req.body;
    if (!nombre || !fecha) return res.status(400).json({ error: 'Nombre y fecha son obligatorios' });
    const torneo = await Torneo.create({ nombre, fecha, descripcion, imagen });
    res.json(torneo);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/api/admin/torneos/:id', async (req, res) => {
  try {
    const torneo = await Torneo.findByPk(req.params.id);
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });

    const fields = ['nombre', 'fecha', 'descripcion', 'imagen', 'estado', 'campeon', 'cantidadJugadores',
                    'inscripciones', 'grupos', 'bracket'];
    const update = {};
    fields.forEach(f => { if (req.body[f] !== undefined) update[f] = req.body[f]; });

    await torneo.update(update);
    res.json(torneo);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/admin/torneos/:id', async (req, res) => {
  try {
    const deleted = await Torneo.findByPk(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Torneo no encontrado' });
    await deleted.destroy();
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
