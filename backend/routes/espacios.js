const express = require('express');
const router  = express.Router();
const Espacio = require('../models/Espacio');
const Reserva = require('../models/Reserva');
const { DEPORTES, DEPORTES_VALIDOS, getEspacios, invalidarCache } = require('../lib/espacios');
const { autorizar, auditar, responderError, hoyStr } = require('../lib/permisos');

router.get('/api/admin/espacios', async (req, res) => {
  try {
    const list = await getEspacios({ soloActivos: req.query.todos !== '1', forzar: true });
    res.json(list.map(e => ({ ...e, deporteNombre: DEPORTES[e.deporte]?.nombre || e.deporte, deporteEmoji: DEPORTES[e.deporte]?.emoji || '' })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/admin/espacios', async (req, res) => {
  try {
    const usuario = await autorizar(req, 'espacio.editar');
    const { nombre, deporte, tipo, precioHora, duracionMinima, pasoMinutos, orden, color } = req.body;
    if (!nombre || !deporte) return res.status(400).json({ error: 'nombre y deporte son obligatorios' });
    if (!DEPORTES_VALIDOS.includes(deporte)) return res.status(400).json({ error: `Deporte inválido. Válidos: ${DEPORTES_VALIDOS.join(', ')}` });

    const espacio = await Espacio.create({
      nombre, deporte,
      tipo: tipo || 'Cubierta',
      precioHora: parseFloat(precioHora) || 0,
      duracionMinima: parseInt(duracionMinima) || 60,
      pasoMinutos: parseInt(pasoMinutos) || 30,
      orden: parseInt(orden) || 0,
      color: color || DEPORTES[deporte]?.color || '#22c55e'
    });
    invalidarCache();

    await auditar(usuario, {
      accion: 'espacio.editar', entidad: 'espacio', entidadId: espacio.id,
      descripcion: `Agregó ${espacio.nombre} (${DEPORTES[deporte].nombre}) a $${espacio.precioHora}/h`,
      detalle: { deporte, precioHora: espacio.precioHora }
    });
    res.json(espacio);
  } catch (err) { responderError(res, err); }
});

router.patch('/api/admin/espacios/:id', async (req, res) => {
  try {
    const usuario = await autorizar(req, 'espacio.editar');
    const espacio = await Espacio.findByPk(parseInt(req.params.id));
    if (!espacio) return res.status(404).json({ error: 'Espacio no encontrado' });

    const cambios = {};
    ['nombre', 'tipo', 'color'].forEach(f => { if (req.body[f] !== undefined) cambios[f] = req.body[f]; });
    if (req.body.precioHora     !== undefined) cambios.precioHora     = parseFloat(req.body.precioHora) || 0;
    if (req.body.duracionMinima !== undefined) cambios.duracionMinima = parseInt(req.body.duracionMinima) || 60;
    if (req.body.pasoMinutos    !== undefined) cambios.pasoMinutos    = parseInt(req.body.pasoMinutos) || 30;
    if (req.body.orden          !== undefined) cambios.orden          = parseInt(req.body.orden) || 0;
    if (req.body.activo         !== undefined) cambios.activo         = !!req.body.activo;
    if (req.body.deporte) {
      if (!DEPORTES_VALIDOS.includes(req.body.deporte)) return res.status(400).json({ error: 'Deporte inválido' });
      cambios.deporte = req.body.deporte;
    }

    const precioAnterior = espacio.precioHora;
    await espacio.update(cambios);
    invalidarCache();

    await auditar(usuario, {
      accion: 'espacio.editar', entidad: 'espacio', entidadId: espacio.id,
      descripcion: cambios.precioHora !== undefined && cambios.precioHora !== precioAnterior
        ? `Cambió el precio de ${espacio.nombre}: $${precioAnterior}/h → $${cambios.precioHora}/h`
        : `Editó ${espacio.nombre}`,
      detalle: cambios
    });
    res.json(espacio);
  } catch (err) { responderError(res, err); }
});

router.delete('/api/admin/espacios/:id', async (req, res) => {
  try {
    const usuario = await autorizar(req, 'espacio.editar');
    const espacio = await Espacio.findByPk(parseInt(req.params.id));
    if (!espacio) return res.status(404).json({ error: 'Espacio no encontrado' });

    /* No se borra: se desactiva, para no dejar huerfanas las reservas historicas. */
    const futuras = await Reserva.count({
      where: { cancha_id: espacio.id, estado_reserva: 'confirmada', fecha: { [require('sequelize').Op.gte]: hoyStr() } }
    });
    if (futuras > 0) return res.status(400).json({ error: `${espacio.nombre} tiene ${futuras} turno(s) a futuro. Liberalos antes de darla de baja.` });

    await espacio.update({ activo: false });
    invalidarCache();
    await auditar(usuario, {
      accion: 'espacio.editar', entidad: 'espacio', entidadId: espacio.id,
      descripcion: `Dio de baja ${espacio.nombre}`
    });
    res.json({ ok: true });
  } catch (err) { responderError(res, err); }
});

module.exports = router;
