const express = require('express');
const router  = express.Router();
const { Op }  = require('sequelize');
const Mesa        = require('../models/Mesa');
const Cuenta      = require('../models/Cuenta');
const Producto    = require('../models/Producto');
const Consumicion = require('../models/Consumicion');
const Pago        = require('../models/Pago');
const Comanda     = require('../models/Comanda');
const { autorizar, auditar, responderError, hoyStr } = require('../lib/permisos');
const { METODOS, METODOS_INFO, cuentaDeMesa, redondear } = require('../lib/cuentas');
const { precioLinea } = require('../lib/opciones');
const { crearComanda } = require('../lib/comandas');

/* ─── Mesas con su estado actual ────────────────────────── */

router.get('/api/admin/mesas', async (req, res) => {
  try {
    const where = req.query.todas === '1' ? {} : { activa: true };
    const mesas = await Mesa.findAll({ where, order: [['orden', 'ASC'], ['id', 'ASC']], raw: true });

    const abiertas = await Cuenta.findAll({ where: { estado: 'abierta' }, raw: true });
    const ids = abiertas.map(c => c.id);
    const [consumos, pagos, comandas] = ids.length ? await Promise.all([
      Consumicion.findAll({ where: { cuentaId: { [Op.in]: ids }, anulada: false }, raw: true }),
      Pago.findAll({ where: { cuentaId: { [Op.in]: ids }, anulado: false }, raw: true }),
      Comanda.findAll({ where: { cuentaId: { [Op.in]: ids }, estado: { [Op.ne]: 'entregado' } }, raw: true })
    ]) : [[], [], []];

    res.json(mesas.map(m => {
      const cuenta = abiertas.find(c => c.mesaId === m.id);
      if (!cuenta) return { ...m, ocupada: false, cuenta: null };

      const cons  = consumos.filter(c => c.cuentaId === cuenta.id);
      const pg    = pagos.filter(p => p.cuentaId === cuenta.id);
      const total = redondear(cons.reduce((s, c) => s + c.total, 0));
      const pagado = redondear(pg.reduce((s, p) => s + p.monto, 0));
      const cmds = comandas.filter(x => x.cuentaId === cuenta.id);

      /*
        Lo que el mozo necesita ver desde el mapa, sin abrir la mesa:
        si hay comida lista para llevar y si todavía hay algo en cocina.
      */
      return {
        ...m, ocupada: true,
        cuenta: {
          id: cuenta.id, abiertaEn: cuenta.abiertaEn, abiertaPor: cuenta.abiertaPor,
          comensales: cuenta.comensales, nota: cuenta.nota,
          items: cons.reduce((s, c) => s + c.cantidad, 0),
          total, pagado, saldo: redondear(total - pagado),
          minutosAbierta: Math.round((Date.now() - new Date(cuenta.abiertaEn).getTime()) / 60000),
          comidaLista: cmds.filter(x => x.estado === 'listo').length,
          enCocina:    cmds.filter(x => x.estado === 'pendiente' || x.estado === 'preparando').length
        }
      };
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/admin/cuenta/:id', async (req, res) => {
  try {
    const cuenta = await Cuenta.findByPk(parseInt(req.params.id), { raw: true });
    if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada' });
    res.json({ ...cuenta, ...(await cuentaDeMesa(cuenta.id)) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─── Abrir y cerrar mesa ───────────────────────────────── */

router.post('/api/admin/mesas/:id/abrir', async (req, res) => {
  try {
    const usuario = await autorizar(req, 'reserva.crear');
    const mesa = await Mesa.findByPk(parseInt(req.params.id));
    if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });

    const yaAbierta = await Cuenta.findOne({ where: { mesaId: mesa.id, estado: 'abierta' } });
    if (yaAbierta) return res.json({ ...yaAbierta.toJSON(), yaEstaba: true });

    const cuenta = await Cuenta.create({
      mesaId: mesa.id, mesaNombre: mesa.nombre, estado: 'abierta',
      comensales: parseInt(req.body.comensales) || 0,
      nota: req.body.nota || '',
      fecha: hoyStr(),
      abiertaPorId: usuario.id, abiertaPor: usuario.nombre, abiertaEn: new Date()
    });

    await auditar(usuario, {
      accion: 'mesa.abrir', entidad: 'cuenta', entidadId: cuenta.id,
      descripcion: `Abrió ${mesa.nombre}${cuenta.comensales ? ` para ${cuenta.comensales} personas` : ''}`,
      fecha: cuenta.fecha, detalle: { mesaId: mesa.id }
    });
    res.json(cuenta);
  } catch (err) { responderError(res, err); }
});

/*
  Cerrar la mesa. Con saldo pendiente hace falta el permiso de anular cobros
  (jefe o dueño) y queda registrado el motivo: una mesa que se cierra sin cobrar
  es exactamente por donde se va la plata.
*/
router.post('/api/admin/cuenta/:id/cerrar', async (req, res) => {
  try {
    const cuenta = await Cuenta.findByPk(parseInt(req.params.id));
    if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada' });
    if (cuenta.estado === 'cerrada') return res.status(400).json({ error: 'Esa mesa ya está cerrada' });

    const detalle = await cuentaDeMesa(cuenta.id);
    const quedaSaldo = detalle.saldo > 0.009;

    const usuario = await autorizar(req, quedaSaldo ? 'cobro.anular' : 'cobro.registrar');
    const motivo = (req.body.motivo || '').trim();
    if (quedaSaldo && !motivo)
      return res.status(400).json({ error: `Quedan $${detalle.saldo} sin cobrar. Escribí el motivo para cerrar igual.`, saldo: detalle.saldo });

    await cuenta.update({
      estado: 'cerrada', cerradaPorId: usuario.id, cerradaPor: usuario.nombre,
      cerradaEn: new Date(), nota: motivo || cuenta.nota
    });

    await auditar(usuario, {
      accion: quedaSaldo ? 'mesa.cerrar_con_saldo' : 'mesa.cerrar',
      entidad: 'cuenta', entidadId: cuenta.id,
      descripcion: quedaSaldo
        ? `Cerró ${cuenta.mesaNombre} dejando $${detalle.saldo} sin cobrar — ${motivo}`
        : `Cerró ${cuenta.mesaNombre}: $${detalle.totalConsumo} cobrados`,
      monto: quedaSaldo ? -detalle.saldo : detalle.totalPagado,
      fecha: cuenta.fecha,
      detalle: { mesaId: cuenta.mesaId, total: detalle.totalConsumo, pagado: detalle.totalPagado, saldo: detalle.saldo, motivo }
    });

    res.json({ ok: true, cuenta: await cuentaDeMesa(cuenta.id), saldoImpago: quedaSaldo ? detalle.saldo : 0 });
  } catch (err) { responderError(res, err); }
});

/* ─── Consumiciones de la mesa ──────────────────────────── */

router.post('/api/admin/cuenta/:id/consumiciones', async (req, res) => {
  try {
    const usuario = await autorizar(req, 'consumicion.crear');
    const cuenta = await Cuenta.findByPk(parseInt(req.params.id));
    if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada' });
    if (cuenta.estado === 'cerrada') return res.status(400).json({ error: 'Esa mesa ya está cerrada' });

    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: 'No mandaste ningún producto' });

    const creadas = [], alertas = [], usados = [];

    for (const item of items) {
      const cantidad = Math.max(1, parseInt(item.cantidad) || 1);
      const producto = await Producto.findByPk(parseInt(item.productoId));
      if (!producto) { alertas.push(`Producto ${item.productoId} inexistente`); continue; }

      const linea = precioLinea(producto, item.opciones, cantidad);
      usados.push(producto.toJSON ? producto.toJSON() : producto);

      creadas.push(await Consumicion.create({
        cuentaId: cuenta.id, reservaId: null, productoId: producto.id,
        nombre: producto.nombre, emoji: producto.emoji,
        cantidad, precioUnitario: linea.precioUnitario, total: linea.total,
        opciones: linea.opciones, detalle: linea.detalle,
        nota: (item.nota || '').trim().slice(0, 120),
        fecha: cuenta.fecha, usuarioId: usuario.id, usuarioNombre: usuario.nombre
      }));

      if (producto.controlaStock) {
        const restante = producto.stock - cantidad;
        await producto.update({ stock: restante });
        if (restante < 0) alertas.push(`${producto.nombre} quedó en ${restante}: hay que ajustar el stock`);
        else if (restante <= producto.stockMinimo) alertas.push(`Quedan ${restante} de ${producto.nombre}`);
      }
    }

    if (!creadas.length) return res.status(400).json({ error: 'No se pudo cargar nada', alertas });

    /* Lo que necesita preparación se va como comanda a la pantalla de cocina */
    const comanda = await crearComanda({
      consumiciones: creadas.map(c => c.toJSON()),
      productos: usados, cuenta: cuenta.toJSON(), usuario, nota: req.body.nota
    });

    const texto = creadas.map(c => `${c.cantidad}x ${c.nombre}${c.detalle ? ' (' + c.detalle + ')' : ''}`).join(', ');
    await auditar(usuario, {
      accion: 'consumicion.crear', entidad: 'cuenta', entidadId: cuenta.id,
      descripcion: `Cargó ${texto} a ${cuenta.mesaNombre}`,
      monto: redondear(creadas.reduce((s, c) => s + c.total, 0)),
      fecha: cuenta.fecha, detalle: { mesaId: cuenta.mesaId, items: creadas.map(c => ({ nombre: c.nombre, cantidad: c.cantidad, total: c.total })) }
    });

    res.json({
      consumiciones: creadas, alertas,
      comanda: comanda ? { id: comanda.id, numero: comanda.numero, estacion: comanda.estacion } : null,
      cuenta: await cuentaDeMesa(cuenta.id)
    });
  } catch (err) { responderError(res, err); }
});

/* ─── Cobros de la mesa, divididos igual que en los turnos ─ */

router.post('/api/admin/cuenta/:id/pago', async (req, res) => {
  try {
    const usuario = await autorizar(req, 'cobro.registrar');
    const cuenta = await Cuenta.findByPk(parseInt(req.params.id));
    if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada' });

    const metodo = String(req.body.metodo || 'efectivo').toLowerCase();
    if (!METODOS.includes(metodo)) return res.status(400).json({ error: `Método inválido. Válidos: ${METODOS.join(', ')}` });

    const previa = await cuentaDeMesa(cuenta.id);
    let monto = req.body.monto !== undefined && req.body.monto !== null && req.body.monto !== ''
      ? parseFloat(req.body.monto) : previa.saldo;
    if (isNaN(monto) || monto <= 0) return res.status(400).json({ error: 'El monto tiene que ser mayor a cero' });
    monto = redondear(monto);

    const pago = await Pago.create({
      cuentaId: cuenta.id, reservaId: null,
      pagador: (req.body.pagador || '').trim() || cuenta.mesaNombre,
      monto, metodo, concepto: 'buffet', fecha: cuenta.fecha,
      nota: req.body.nota || '',
      usuarioId: usuario.id, usuarioNombre: usuario.nombre
    });

    const despues = await cuentaDeMesa(cuenta.id);
    await auditar(usuario, {
      accion: 'cobro.registrar', entidad: 'pago', entidadId: pago.id,
      descripcion: `Cobró $${monto} en ${METODOS_INFO[metodo].nombre} de ${pago.pagador} — ${cuenta.mesaNombre}`,
      monto, fecha: cuenta.fecha,
      detalle: { cuentaId: cuenta.id, mesaId: cuenta.mesaId, metodo, saldoRestante: despues.saldo }
    });

    res.json({ pago, cuenta: despues, vuelto: monto > previa.saldo ? redondear(monto - previa.saldo) : 0 });
  } catch (err) { responderError(res, err); }
});

/*
  Varios pagos de una vez. En una mesa de cuatro cada uno paga lo suyo: se anotan
  los cuatro y se toca Cobrar una sola vez, con un solo PIN.
*/
router.post('/api/admin/cuenta/:id/pagos', async (req, res) => {
  try {
    const usuario = await autorizar(req, 'cobro.registrar');
    const cuenta = await Cuenta.findByPk(parseInt(req.params.id));
    if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada' });

    const lista = Array.isArray(req.body.pagos) ? req.body.pagos : [];
    if (!lista.length) return res.status(400).json({ error: 'No mandaste ningún pago' });

    const previa = await cuentaDeMesa(cuenta.id);
    const creados = [];
    let acumulado = 0;
    for (const p of lista) {
      const metodo = String(p.metodo || 'efectivo').toLowerCase();
      if (!METODOS.includes(metodo)) return res.status(400).json({ error: `Método inválido: ${p.metodo}` });
      /* Sin monto en la última línea = "lo que falte" */
      let monto = p.monto !== undefined && p.monto !== null && p.monto !== '' ? parseFloat(p.monto) : redondear(previa.saldo - acumulado);
      if (isNaN(monto) || monto <= 0) return res.status(400).json({ error: `Monto inválido para ${p.pagador || 'un pago'}` });
      monto = redondear(monto); acumulado = redondear(acumulado + monto);
      creados.push(await Pago.create({
        cuentaId: cuenta.id, reservaId: null,
        pagador: (p.pagador || '').trim() || cuenta.mesaNombre,
        monto, metodo, concepto: 'buffet', fecha: cuenta.fecha, nota: p.nota || '',
        usuarioId: usuario.id, usuarioNombre: usuario.nombre
      }));
    }

    const despues = await cuentaDeMesa(cuenta.id);
    await auditar(usuario, {
      accion: 'cobro.registrar', entidad: 'cuenta', entidadId: cuenta.id,
      descripcion: `Cobró ${cuenta.mesaNombre}: ` + creados.map(c => `${c.pagador} $${c.monto} ${METODOS_INFO[c.metodo].nombre}`).join(', '),
      monto: acumulado, fecha: cuenta.fecha,
      detalle: { cuentaId: cuenta.id, mesaId: cuenta.mesaId, pagos: creados.map(c => ({ pagador: c.pagador, monto: c.monto, metodo: c.metodo })), saldoRestante: despues.saldo }
    });

    res.json({ pagos: creados, cuenta: despues, vuelto: acumulado > previa.saldo ? redondear(acumulado - previa.saldo) : 0 });
  } catch (err) { responderError(res, err); }
});

/* ─── Historial de mesas del día ────────────────────────── */

router.get('/api/admin/mesas/historial', async (req, res) => {
  try {
    const desde = req.query.desde || hoyStr();
    const hasta = req.query.hasta || desde;

    const cuentas = await Cuenta.findAll({
      where: { fecha: { [Op.gte]: desde, [Op.lte]: hasta } },
      order: [['id', 'DESC']], raw: true
    });
    const ids = cuentas.map(c => c.id);
    const [consumos, pagos] = ids.length ? await Promise.all([
      Consumicion.findAll({ where: { cuentaId: { [Op.in]: ids }, anulada: false }, raw: true }),
      Pago.findAll({ where: { cuentaId: { [Op.in]: ids }, anulado: false }, raw: true })
    ]) : [[], []];

    const filas = cuentas.map(c => {
      const cons  = consumos.filter(x => x.cuentaId === c.id);
      const pg    = pagos.filter(x => x.cuentaId === c.id);
      const total = redondear(cons.reduce((s, x) => s + x.total, 0));
      const pagado = redondear(pg.reduce((s, x) => s + x.monto, 0));
      return {
        id: c.id, mesa: c.mesaNombre, estado: c.estado, fecha: c.fecha,
        abiertaPor: c.abiertaPor, cerradaPor: c.cerradaPor,
        abiertaEn: c.abiertaEn, cerradaEn: c.cerradaEn,
        comensales: c.comensales, nota: c.nota,
        items: cons.reduce((s, x) => s + x.cantidad, 0),
        total, pagado, saldo: redondear(total - pagado)
      };
    });

    res.json({
      desde, hasta,
      cuentas: filas,
      facturado: redondear(filas.reduce((s, f) => s + f.total, 0)),
      cobrado:   redondear(filas.reduce((s, f) => s + f.pagado, 0)),
      /* Mesas cerradas con saldo: la alerta que mira el dueño */
      cerradasSinCobrar: filas.filter(f => f.estado === 'cerrada' && f.saldo > 0.009)
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
