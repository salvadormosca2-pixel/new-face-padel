const express = require('express');
const router  = express.Router();
const { Op }  = require('sequelize');
const Comanda     = require('../models/Comanda');
const Consumicion = require('../models/Consumicion');
const Producto    = require('../models/Producto');
const { autorizar, auditar, responderError, hoyStr } = require('../lib/permisos');
const { ESTADOS, ESTADO_INFO, camposDeEstado, minutosDesde, urgencia } = require('../lib/comandas');

/*
  El tablero del cocinero. Se pide cada pocos segundos, así que devuelve
  solo lo del día y lo arma listo para pintar: sin cuentas del lado del navegador.
*/
router.get('/api/admin/cocina', async (req, res) => {
  try {
    const fecha = req.query.fecha || hoyStr();
    const verEntregadas = req.query.entregadas === '1';

    const where = { fecha };
    if (!verEntregadas) where.estado = { [Op.ne]: 'entregado' };

    const comandas = await Comanda.findAll({ where, order: [['numero', 'ASC']], raw: true });
    const ids = comandas.map(c => c.id);
    const items = ids.length
      ? await Consumicion.findAll({ where: { comandaId: { [Op.in]: ids }, anulada: false }, order: [['id', 'ASC']], raw: true })
      : [];

    const armadas = comandas.map(c => {
      const mios = items.filter(i => i.comandaId === c.id);
      const min  = minutosDesde(c.enviadaEn);
      return {
        id: c.id, numero: c.numero, lugar: c.lugar, mesaId: c.mesaId,
        estado: c.estado, estadoNombre: ESTADO_INFO[c.estado]?.nombre || c.estado,
        estacion: c.estacion, mozo: c.mozo, nota: c.nota,
        tomadaPor: c.tomadaPor,
        enviadaEn: c.enviadaEn,
        minutos: min,
        urgencia: c.estado === 'listo' || c.estado === 'entregado' ? 'normal' : urgencia(min),
        minutosListo: c.listoEn ? minutosDesde(c.listoEn) : null,
        items: mios.map(i => ({
          id: i.id, nombre: i.nombre, cantidad: i.cantidad,
          detalle: i.detalle || '', nota: i.nota || '',
          estadoCocina: i.estadoCocina || 'pendiente'
        })),
        platos: mios.reduce((s, i) => s + i.cantidad, 0)
      };
    }).filter(c => c.items.length > 0);

    /* Lo nuevo primero, y dentro de cada estado lo más viejo arriba */
    armadas.sort((a, b) => (ESTADO_INFO[a.estado].orden - ESTADO_INFO[b.estado].orden) || (b.minutos - a.minutos));

    res.json({
      fecha,
      comandas: armadas,
      resumen: {
        nuevas:     armadas.filter(c => c.estado === 'pendiente').length,
        preparando: armadas.filter(c => c.estado === 'preparando').length,
        listas:     armadas.filter(c => c.estado === 'listo').length,
        platos:     armadas.filter(c => c.estado !== 'entregado').reduce((s, c) => s + c.platos, 0),
        demoradas:  armadas.filter(c => c.urgencia !== 'normal' && c.estado !== 'listo').length
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/*
  Cambiar el estado de una comanda.
  No se firma con PIN: en la cocina hay harina en las manos y un teclado
  numérico por plato haría que nadie lo use. Igual queda en la auditoría
  quién la tomó, que es lo que importa para saber por dónde viene la demora.
*/
router.patch('/api/admin/comanda/:id/estado', async (req, res) => {
  try {
    const comanda = await Comanda.findByPk(parseInt(req.params.id));
    if (!comanda) return res.status(404).json({ error: 'Comanda no encontrada' });

    const estado = String(req.body.estado || '');
    if (!ESTADOS.includes(estado)) return res.status(400).json({ error: `Estado inválido. Válidos: ${ESTADOS.join(', ')}` });

    const quien = (req.body.quien || '').trim();
    await comanda.update(camposDeEstado(estado, { nombre: quien }));

    if (estado === 'listo' || estado === 'entregado') {
      await Consumicion.update({ estadoCocina: 'listo' }, { where: { comandaId: comanda.id } });
    }

    await auditar(null, {
      accion: 'comanda.estado', entidad: 'comanda', entidadId: comanda.id,
      actor: quien || 'Cocina', actorRol: 'cocina',
      descripcion: `Comanda #${comanda.numero} de ${comanda.lugar}: ${ESTADO_INFO[estado].nombre.toLowerCase()}`,
      fecha: comanda.fecha,
      detalle: { estado, minutos: minutosDesde(comanda.enviadaEn) }
    });

    res.json({ ok: true, comanda });
  } catch (err) { responderError(res, err); }
});

/* Un plato suelto listo, cuando la comanda sale escalonada */
router.patch('/api/admin/comanda/item/:id', async (req, res) => {
  try {
    const item = await Consumicion.findByPk(parseInt(req.params.id));
    if (!item) return res.status(404).json({ error: 'Ese plato no está en ninguna comanda' });

    const estadoCocina = req.body.estadoCocina === 'listo' ? 'listo' : 'pendiente';
    await item.update({ estadoCocina });

    /* Si ya salieron todos, la comanda queda lista sola */
    if (estadoCocina === 'listo' && item.comandaId) {
      const quedan = await Consumicion.count({
        where: { comandaId: item.comandaId, anulada: false, estadoCocina: { [Op.ne]: 'listo' } }
      });
      if (quedan === 0) {
        const c = await Comanda.findByPk(item.comandaId);
        if (c && c.estado !== 'listo' && c.estado !== 'entregado') await c.update(camposDeEstado('listo', {}));
      }
    }

    res.json({ ok: true });
  } catch (err) { responderError(res, err); }
});

/* Historial del día, para ver tiempos de cocina */
router.get('/api/admin/cocina/historial', async (req, res) => {
  try {
    const fecha = req.query.fecha || hoyStr();
    const comandas = await Comanda.findAll({ where: { fecha }, order: [['numero', 'DESC']], raw: true });

    const conTiempo = comandas.filter(c => c.listoEn);
    const demoras = conTiempo.map(c => Math.round((new Date(c.listoEn) - new Date(c.enviadaEn)) / 60000));

    res.json({
      fecha,
      total: comandas.length,
      promedioMinutos: demoras.length ? Math.round(demoras.reduce((a, b) => a + b, 0) / demoras.length) : 0,
      peorMinutos: demoras.length ? Math.max(...demoras) : 0,
      comandas: comandas.map(c => ({
        numero: c.numero, lugar: c.lugar, mozo: c.mozo, estado: c.estado,
        enviadaEn: c.enviadaEn, listoEn: c.listoEn,
        minutos: c.listoEn ? Math.round((new Date(c.listoEn) - new Date(c.enviadaEn)) / 60000) : null
      }))
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
