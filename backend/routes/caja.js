const express = require('express');
const router  = express.Router();
const { Op }  = require('sequelize');
const Pago    = require('../models/Pago');
const Reserva = require('../models/Reserva');
const Consumicion = require('../models/Consumicion');
const { autorizar, auditar, responderError, hoyStr } = require('../lib/permisos');
const { METODOS, METODOS_INFO, cuentaDeReserva, recalcularEstadoPago, redondear } = require('../lib/cuentas');
const { ORIGENES, getEspacios } = require('../lib/espacios');

router.get('/api/admin/metodos-pago', (_req, res) => {
  res.json(METODOS.map(m => ({ id: m, ...METODOS_INFO[m] })));
});

/* ─── Pagos parciales de un turno ───────────────────────────
   En padel cada uno paga lo suyo. Un turno puede tener N pagos:
   Salvador 7000 efectivo + Nacho 7000 transferencia.
   ──────────────────────────────────────────────────────────── */

router.get('/api/admin/reserva/:id/pagos', async (req, res) => {
  try {
    const cuenta = await cuentaDeReserva(parseInt(req.params.id));
    if (!cuenta) return res.status(404).json({ error: 'Turno no encontrado' });
    res.json(cuenta);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/admin/reserva/:id/pago', async (req, res) => {
  try {
    const usuario = await autorizar(req, 'cobro.registrar');
    const reservaId = parseInt(req.params.id);
    const reserva = await Reserva.findByPk(reservaId);
    if (!reserva) return res.status(404).json({ error: 'Turno no encontrado' });

    const metodo = String(req.body.metodo || 'efectivo').toLowerCase();
    if (!METODOS.includes(metodo)) return res.status(400).json({ error: `Método inválido. Válidos: ${METODOS.join(', ')}` });

    const previa = await cuentaDeReserva(reservaId);

    /* Sin monto se cobra el saldo completo: el caso "paga uno solo todo". */
    let monto = req.body.monto !== undefined && req.body.monto !== null && req.body.monto !== ''
      ? parseFloat(req.body.monto)
      : previa.saldo;
    if (isNaN(monto) || monto <= 0) return res.status(400).json({ error: 'El monto tiene que ser mayor a cero' });
    monto = redondear(monto);

    const pago = await Pago.create({
      reservaId,
      pagador: (req.body.pagador || '').trim() || reserva.cliente_nombre,
      monto, metodo,
      concepto: ['cancha', 'buffet', 'mixto'].includes(req.body.concepto) ? req.body.concepto : 'mixto',
      fecha: reserva.fecha,
      nota: req.body.nota || '',
      usuarioId: usuario.id, usuarioNombre: usuario.nombre
    });

    const cuenta = await recalcularEstadoPago(reservaId);

    await auditar(usuario, {
      accion: 'cobro.registrar', entidad: 'pago', entidadId: pago.id,
      descripcion: `Cobró $${monto} en ${METODOS_INFO[metodo].nombre} de ${pago.pagador} — turno ${reserva.fecha} ${reserva.hora_inicio} (${reserva.cliente_nombre})`,
      monto, fecha: reserva.fecha,
      detalle: { reservaId, metodo, pagador: pago.pagador, saldoRestante: cuenta.saldo }
    });

    res.json({ pago, cuenta, vuelto: monto > previa.saldo ? redondear(monto - previa.saldo) : 0 });
  } catch (err) { responderError(res, err); }
});

/* Varios pagos de una vez para un turno de cancha: cada jugador lo suyo, un solo PIN */
router.post('/api/admin/reserva/:id/pagos', async (req, res) => {
  try {
    const usuario = await autorizar(req, 'cobro.registrar');
    const reservaId = parseInt(req.params.id);
    const reserva = await Reserva.findByPk(reservaId);
    if (!reserva) return res.status(404).json({ error: 'Turno no encontrado' });

    const lista = Array.isArray(req.body.pagos) ? req.body.pagos : [];
    if (!lista.length) return res.status(400).json({ error: 'No mandaste ningún pago' });

    const previa = await cuentaDeReserva(reservaId);
    const creados = [];
    let acumulado = 0;
    for (const p of lista) {
      const metodo = String(p.metodo || 'efectivo').toLowerCase();
      if (!METODOS.includes(metodo)) return res.status(400).json({ error: `Método inválido: ${p.metodo}` });
      let monto = p.monto !== undefined && p.monto !== null && p.monto !== '' ? parseFloat(p.monto) : redondear(previa.saldo - acumulado);
      if (isNaN(monto) || monto <= 0) return res.status(400).json({ error: `Monto inválido para ${p.pagador || 'un pago'}` });
      monto = redondear(monto); acumulado = redondear(acumulado + monto);
      creados.push(await Pago.create({
        reservaId, pagador: (p.pagador || '').trim() || reserva.cliente_nombre,
        monto, metodo, concepto: 'mixto', fecha: reserva.fecha, nota: p.nota || '',
        usuarioId: usuario.id, usuarioNombre: usuario.nombre
      }));
    }

    const cuenta = await recalcularEstadoPago(reservaId);
    await auditar(usuario, {
      accion: 'cobro.registrar', entidad: 'reserva', entidadId: reservaId,
      descripcion: `Cobró turno ${reserva.fecha} ${reserva.hora_inicio} (${reserva.cliente_nombre}): ` + creados.map(c => `${c.pagador} $${c.monto} ${METODOS_INFO[c.metodo].nombre}`).join(', '),
      monto: acumulado, fecha: reserva.fecha,
      detalle: { reservaId, pagos: creados.map(c => ({ pagador: c.pagador, monto: c.monto, metodo: c.metodo })), saldoRestante: cuenta.saldo }
    });

    res.json({ pagos: creados, cuenta, vuelto: acumulado > previa.saldo ? redondear(acumulado - previa.saldo) : 0 });
  } catch (err) { responderError(res, err); }
});

router.delete('/api/admin/pago/:id', async (req, res) => {
  try {
    const usuario = await autorizar(req, 'cobro.anular');
    const pago = await Pago.findByPk(parseInt(req.params.id));
    if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });
    if (pago.anulado) return res.status(400).json({ error: 'Ese pago ya estaba anulado' });

    await pago.update({ anulado: true });
    const cuenta = await recalcularEstadoPago(pago.reservaId);

    await auditar(usuario, {
      accion: 'cobro.anular', entidad: 'pago', entidadId: pago.id,
      descripcion: `Anuló un cobro de $${pago.monto} en ${METODOS_INFO[pago.metodo]?.nombre || pago.metodo} — lo había cobrado ${pago.usuarioNombre}`,
      monto: -pago.monto, fecha: pago.fecha,
      detalle: { reservaId: pago.reservaId, cobradoPor: pago.usuarioNombre, motivo: req.body?.motivo || '' }
    });

    res.json({ ok: true, cuenta });
  } catch (err) { responderError(res, err); }
});

/*
  Compatibilidad: el viejo "marcar como pagado" de un toque.
  Registra un pago por todo el saldo con el metodo elegido, o revierte a pendiente
  anulando los pagos del turno.
*/
router.patch('/api/admin/pago', async (req, res) => {
  try {
    const { id, claveUnica, metodoPago, metodoCobro, estado } = req.body;
    const reserva = await Reserva.findOne({ where: claveUnica ? { claveUnica } : { id } });
    if (!reserva) return res.status(404).json({ error: 'Reserva no encontrada' });

    if (estado === 'pendiente') {
      const usuario = await autorizar(req, 'cobro.anular');
      const pagos = await Pago.findAll({ where: { reservaId: reserva.id, anulado: false } });
      for (const p of pagos) await p.update({ anulado: true });
      const cuenta = await recalcularEstadoPago(reserva.id);
      await auditar(usuario, {
        accion: 'cobro.anular', entidad: 'reserva', entidadId: reserva.id,
        descripcion: `Volvió a pendiente el turno de ${reserva.cliente_nombre} (${reserva.fecha} ${reserva.hora_inicio}): anuló ${pagos.length} cobro(s)`,
        monto: -pagos.reduce((s, p) => s + p.monto, 0), fecha: reserva.fecha
      });
      return res.json({ ok: true, cuenta });
    }

    const usuario = await autorizar(req, 'cobro.registrar');
    const metodo = String(metodoPago || metodoCobro || 'efectivo').toLowerCase();
    if (!METODOS.includes(metodo)) return res.status(400).json({ error: `Método inválido. Válidos: ${METODOS.join(', ')}` });

    const previa = await cuentaDeReserva(reserva.id);
    const monto  = req.body.monto ? redondear(parseFloat(req.body.monto)) : previa.saldo;
    if (monto <= 0) return res.status(400).json({ error: 'Este turno no tiene saldo pendiente' });

    const pago = await Pago.create({
      reservaId: reserva.id, pagador: reserva.cliente_nombre, monto, metodo,
      concepto: 'mixto', fecha: reserva.fecha,
      usuarioId: usuario.id, usuarioNombre: usuario.nombre
    });
    const cuenta = await recalcularEstadoPago(reserva.id);

    await auditar(usuario, {
      accion: 'cobro.registrar', entidad: 'pago', entidadId: pago.id,
      descripcion: `Cobró $${monto} en ${METODOS_INFO[metodo].nombre} — turno ${reserva.fecha} ${reserva.hora_inicio} (${reserva.cliente_nombre})`,
      monto, fecha: reserva.fecha, detalle: { reservaId: reserva.id, metodo }
    });

    res.json({ ...reserva.toJSON(), cuenta });
  } catch (err) { responderError(res, err); }
});

/* ─── Caja ──────────────────────────────────────────────────
   Efectivo vs transferencia, cancha vs buffet, y quien cobro cada peso.
   ──────────────────────────────────────────────────────────── */

async function armarCaja(desde, hasta) {
  const [pagos, reservas, consumos, espacios] = await Promise.all([
    Pago.findAll({ where: { fecha: { [Op.gte]: desde, [Op.lte]: hasta }, anulado: false }, order: [['id', 'DESC']], raw: true }),
    Reserva.findAll({ where: { fecha: { [Op.gte]: desde, [Op.lte]: hasta }, estado_reserva: 'confirmada' }, raw: true }),
    Consumicion.findAll({ where: { fecha: { [Op.gte]: desde, [Op.lte]: hasta }, anulada: false }, raw: true }),
    getEspacios({ soloActivos: false })
  ]);

  const porMetodo = {};
  METODOS.forEach(m => { porMetodo[m] = { ...METODOS_INFO[m], id: m, total: 0, operaciones: 0 }; });
  pagos.forEach(p => {
    if (!porMetodo[p.metodo]) porMetodo[p.metodo] = { id: p.metodo, nombre: p.metodo, total: 0, operaciones: 0 };
    porMetodo[p.metodo].total = redondear(porMetodo[p.metodo].total + p.monto);
    porMetodo[p.metodo].operaciones++;
  });

  const porUsuario = {};
  pagos.forEach(p => {
    const k = p.usuarioNombre || 'Sistema';
    if (!porUsuario[k]) { porUsuario[k] = { nombre: k, total: 0, operaciones: 0, efectivo: 0, transferencia: 0, otros: 0 }; }
    const u = porUsuario[k];
    u.total = redondear(u.total + p.monto);
    u.operaciones++;
    if (p.metodo === 'efectivo') u.efectivo = redondear(u.efectivo + p.monto);
    else if (p.metodo === 'transferencia') u.transferencia = redondear(u.transferencia + p.monto);
    else u.otros = redondear(u.otros + p.monto);
  });

  const porOrigen = {};
  reservas.forEach(r => {
    const k = r.origen || 'mostrador';
    if (!porOrigen[k]) porOrigen[k] = { id: k, nombre: ORIGENES[k]?.nombre || k, color: ORIGENES[k]?.color || '#64748b', turnos: 0, facturado: 0 };
    porOrigen[k].turnos++;
    porOrigen[k].facturado = redondear(porOrigen[k].facturado + (r.monto || 0));
  });

  const cobrado      = redondear(pagos.reduce((s, p) => s + p.monto, 0));
  const totalCanchas = redondear(reservas.filter(r => r.origen !== 'bloqueo').reduce((s, r) => s + (r.monto || 0), 0));
  const totalBuffet  = redondear(consumos.reduce((s, c) => s + c.total, 0));
  const facturado    = redondear(totalCanchas + totalBuffet);

  const faltas = reservas.filter(r => r.asistencia === 'falta');

  return {
    desde, hasta,
    cobrado, facturado, porCobrar: redondear(facturado - cobrado),
    totalCanchas, totalBuffet,
    efectivo:      porMetodo.efectivo.total,
    transferencia: porMetodo.transferencia.total,
    porMetodo:  Object.values(porMetodo),
    porUsuario: Object.values(porUsuario).sort((a, b) => b.total - a.total),
    porOrigen:  Object.values(porOrigen).sort((a, b) => b.facturado - a.facturado),
    turnos: reservas.length,
    faltas: faltas.length,
    faltasDetalle: faltas.map(r => ({
      id: r.id, cliente: r.cliente_nombre, fecha: r.fecha, hora: r.hora_inicio,
      cancha: espacios.find(e => e.id === r.cancha_id)?.nombre || r.cancha_id,
      origen: ORIGENES[r.origen]?.nombre || r.origen, monto: r.monto
    })),
    movimientos: pagos.map(p => ({
      ...p,
      metodoNombre: METODOS_INFO[p.metodo]?.nombre || p.metodo,
      metodoEmoji:  METODOS_INFO[p.metodo]?.emoji || '💰'
    }))
  };
}

router.get('/api/admin/caja', async (req, res) => {
  try {
    const desde = req.query.desde || hoyStr();
    const hasta = req.query.hasta || desde;
    res.json(await armarCaja(desde, hasta));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/admin/caja/:fecha', async (req, res) => {
  try {
    res.json(await armarCaja(req.params.fecha, req.params.fecha));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/*
  Cierre de caja: se declara el efectivo contado y queda el registro de la diferencia.
  No borra nada, solo deja el arqueo firmado en la auditoria.
*/
router.post('/api/admin/caja/cerrar', async (req, res) => {
  try {
    const usuario = await autorizar(req, 'caja.cerrar');
    const fecha = req.body.fecha || hoyStr();
    const caja = await armarCaja(fecha, fecha);

    const contado = parseFloat(req.body.efectivoContado);
    if (isNaN(contado)) return res.status(400).json({ error: 'Declará cuánto efectivo contaste' });
    const diferencia = redondear(contado - caja.efectivo);

    await auditar(usuario, {
      accion: 'caja.cerrar', entidad: 'caja', entidadId: fecha,
      descripcion: diferencia === 0
        ? `Cerró la caja del ${fecha}: $${caja.efectivo} en efectivo, sin diferencia`
        : `Cerró la caja del ${fecha}: contó $${contado} contra $${caja.efectivo} del sistema (${diferencia > 0 ? 'sobra' : 'falta'} $${Math.abs(diferencia)})`,
      monto: caja.efectivo, fecha,
      detalle: { esperado: caja.efectivo, contado, diferencia, transferencias: caja.transferencia, nota: req.body.nota || '' }
    });

    res.json({ ok: true, fecha, esperado: caja.efectivo, contado, diferencia, caja });
  } catch (err) { responderError(res, err); }
});

module.exports = router;
