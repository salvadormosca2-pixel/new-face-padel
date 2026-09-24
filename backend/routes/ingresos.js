const express = require('express');
const router  = express.Router();
const { Op }  = require('sequelize');
const Reserva     = require('../models/Reserva');
const Socio       = require('../models/Socio');
const Pago        = require('../models/Pago');
const Consumicion = require('../models/Consumicion');
const { METODOS, METODOS_INFO, redondear } = require('../lib/cuentas');
const { ORIGENES, DEPORTES, getEspacios } = require('../lib/espacios');

const { hoyClub, diasDesdeHoy } = require('../lib/fechas');

function hoy()      { return hoyClub(); }
function hace(dias) { return diasDesdeHoy(-dias); }

/* La plata cobrada sale de la tabla de pagos: es la unica que sabe de cobros divididos. */
async function pagosEntre(desde, hasta) {
  return Pago.findAll({ where: { fecha: { [Op.gte]: desde, [Op.lte]: hasta }, anulado: false }, raw: true });
}
async function consumosEntre(desde, hasta) {
  return Consumicion.findAll({ where: { fecha: { [Op.gte]: desde, [Op.lte]: hasta }, anulada: false }, raw: true });
}

function acumularMetodos(pagos) {
  const porMetodo = {};
  METODOS.forEach(m => { porMetodo[m] = 0; });
  pagos.forEach(p => { if (porMetodo[p.metodo] !== undefined) porMetodo[p.metodo] = redondear(porMetodo[p.metodo] + p.monto); });
  return porMetodo;
}

router.get('/api/admin/ingresos/hoy', async (_req, res) => {
  try {
    const h = hoy();
    const [reservas, pagos, consumos] = await Promise.all([
      Reserva.findAll({ where: { fecha: h, estado_reserva: 'confirmada' }, raw: true }),
      pagosEntre(h, h),
      consumosEntre(h, h)
    ]);

    const porMetodo   = acumularMetodos(pagos);
    const total       = redondear(pagos.reduce((s, p) => s + p.monto, 0));
    const totalBuffet = redondear(consumos.reduce((s, c) => s + c.total, 0));
    const facturado   = redondear(reservas.filter(r => r.origen !== 'bloqueo').reduce((s, r) => s + (r.monto || 0), 0) + totalBuffet);

    res.json({
      fecha: h, total, facturado, porCobrar: redondear(facturado - total), totalBuffet,
      pagadas:    reservas.filter(r => r.estado_pago === 'pagado').length,
      parciales:  reservas.filter(r => r.estado_pago === 'parcial').length,
      pendientes: reservas.filter(r => r.estado_pago === 'pendiente').length,
      faltas:     reservas.filter(r => r.asistencia === 'falta').length,
      totalTurnos: reservas.length,
      porMetodo
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/admin/ingresos/semana', async (_req, res) => {
  try {
    const dias     = Array.from({ length: 7 }, (_, i) => hace(6 - i));
    const diasPrev = Array.from({ length: 7 }, (_, i) => hace(13 - i));
    const [sem, prev] = await Promise.all([
      pagosEntre(dias[0], dias[6]),
      pagosEntre(diasPrev[0], diasPrev[6])
    ]);

    const porDia = dias.map(fecha => {
      const delDia = sem.filter(p => p.fecha === fecha);
      return { fecha, total: redondear(delDia.reduce((s, p) => s + p.monto, 0)), reservas: new Set(delDia.map(p => p.reservaId)).size };
    });
    const totalSemana = redondear(porDia.reduce((s, d) => s + d.total, 0));
    const totalPrevio = redondear(prev.reduce((s, p) => s + p.monto, 0));
    const variacion   = totalPrevio > 0 ? Math.round(((totalSemana - totalPrevio) / totalPrevio) * 100) : 0;

    res.json({ porDia, totalSemana, totalPrevio, variacion });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/admin/ingresos/reporte', async (_req, res) => {
  try {
    const desde = hace(6), hasta = hoy();
    const [reservas, pagos, espacios] = await Promise.all([
      Reserva.findAll({ where: { fecha: { [Op.gte]: desde, [Op.lte]: hasta }, estado_reserva: 'confirmada' }, raw: true }),
      pagosEntre(desde, hasta),
      getEspacios({ soloActivos: false })
    ]);

    const pagoPorReserva = {};
    pagos.forEach(p => { pagoPorReserva[p.reservaId] = redondear((pagoPorReserva[p.reservaId] || 0) + p.monto); });

    const porCancha = {}, ingCancha = {}, porHora = {}, porOrigen = {}, porDeporte = {};
    espacios.forEach(e => { porCancha[e.id] = 0; ingCancha[e.id] = 0; });

    reservas.forEach(r => {
      porCancha[r.cancha_id] = (porCancha[r.cancha_id] || 0) + 1;
      ingCancha[r.cancha_id] = redondear((ingCancha[r.cancha_id] || 0) + (pagoPorReserva[r.id] || 0));
      porHora[r.hora_inicio] = (porHora[r.hora_inicio] || 0) + 1;

      const o = r.origen || 'mostrador';
      if (!porOrigen[o]) porOrigen[o] = { id: o, nombre: ORIGENES[o]?.nombre || o, color: ORIGENES[o]?.color, turnos: 0, cobrado: 0 };
      porOrigen[o].turnos++;
      porOrigen[o].cobrado = redondear(porOrigen[o].cobrado + (pagoPorReserva[r.id] || 0));

      const d = r.deporte || 'padel';
      if (!porDeporte[d]) porDeporte[d] = { id: d, nombre: DEPORTES[d]?.nombre || d, emoji: DEPORTES[d]?.emoji, turnos: 0, cobrado: 0 };
      porDeporte[d].turnos++;
      porDeporte[d].cobrado = redondear(porDeporte[d].cobrado + (pagoPorReserva[r.id] || 0));
    });

    const sortObj  = o => Object.entries(o).sort((a, b) => b[1] - a[1]);
    const sortHora = Object.entries(porHora).sort((a, b) => b[1] - a[1]);

    res.json({
      porCancha, ingCancha, porHora,
      porMetodo: acumularMetodos(pagos),
      porOrigen:  Object.values(porOrigen).sort((a, b) => b.cobrado - a.cobrado),
      porDeporte: Object.values(porDeporte).sort((a, b) => b.cobrado - a.cobrado),
      canchaTop:      { cancha: sortObj(ingCancha)[0]?.[0],           monto:    sortObj(ingCancha)[0]?.[1] },
      canchaMenosUso: { cancha: sortObj(porCancha).reverse()[0]?.[0], reservas: sortObj(porCancha).reverse()[0]?.[1] },
      horaPico:       { hora: sortHora[0]?.[0],                       reservas: sortHora[0]?.[1] },
      horaFloja:      { hora: sortHora[sortHora.length - 1]?.[0],     reservas: sortHora[sortHora.length - 1]?.[1] },
      faltas: reservas.filter(r => r.asistencia === 'falta').length
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/admin/ingresos/mes', async (req, res) => {
  try {
    const year    = parseInt(req.query.year || req.query.ano || req.query['año']) || new Date().getFullYear();
    const mes     = parseInt(req.query.mes) || new Date().getMonth() + 1;
    const desde   = `${year}-${String(mes).padStart(2, '0')}-01`;
    const diasMes = new Date(year, mes, 0).getDate();
    const hasta   = `${year}-${String(mes).padStart(2, '0')}-${String(diasMes).padStart(2, '0')}`;

    const [pagos, consumos] = await Promise.all([pagosEntre(desde, hasta), consumosEntre(desde, hasta)]);

    const total     = redondear(pagos.reduce((s, p) => s + p.monto, 0));
    const porMetodo = acumularMetodos(pagos);

    const porDiaSemana = {};
    pagos.forEach(p => {
      const dow = ['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado'][new Date(p.fecha + 'T12:00:00').getDay()];
      porDiaSemana[dow] = redondear((porDiaSemana[dow] || 0) + p.monto);
    });
    const mejor_dia = Object.entries(porDiaSemana).sort((a, b) => b[1] - a[1])[0]?.[0] || '---';
    const totalMetodos = METODOS.reduce((s, m) => s + porMetodo[m], 0) || 1;

    res.json({
      mes: {
        total,
        reservas: new Set(pagos.map(p => p.reservaId)).size,
        promedio: Math.round(total / diasMes),
        mejor_dia,
        buffet: redondear(consumos.reduce((s, c) => s + c.total, 0))
      },
      metodos: METODOS.map(m => ({
        nombre: METODOS_INFO[m].nombre, id: m, monto: porMetodo[m],
        porcentaje: Math.round(porMetodo[m] / totalMetodos * 100)
      }))
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/*
  Lo que se jugó y no se cobró. El dueño lo quiere junto: las faltas (no vinieron
  y el turno no se cobró) y los turnos que sí se jugaron pero quedaron con saldo.
*/
router.get('/api/admin/sin-cobrar', async (req, res) => {
  try {
    const desde = req.query.desde || hace(30);
    const hasta = req.query.hasta || hoy();

    const [reservas, pagos, consumos, espacios] = await Promise.all([
      Reserva.findAll({ where: { fecha: { [Op.gte]: desde, [Op.lte]: hasta }, estado_reserva: 'confirmada' },
                        order: [['fecha', 'DESC'], ['hora_inicio', 'DESC']], raw: true }),
      pagosEntre(desde, hasta),
      consumosEntre(desde, hasta),
      getEspacios({ soloActivos: false })
    ]);

    const pagadoPor = {}, consumoPor = {};
    pagos.forEach(p => { pagadoPor[p.reservaId] = redondear((pagadoPor[p.reservaId] || 0) + p.monto); });
    consumos.forEach(c => { consumoPor[c.reservaId] = redondear((consumoPor[c.reservaId] || 0) + c.total); });

    const deudas = reservas
      .filter(r => r.origen !== 'bloqueo')
      .map(r => {
        const totalCancha  = r.monto || 0;
        const totalConsumo = consumoPor[r.id] || 0;
        const pagado       = pagadoPor[r.id] || 0;
        return {
          id: r.id, fecha: r.fecha, hora: r.hora_inicio,
          cliente: r.cliente_nombre, telefono: r.cliente_telefono || '',
          cancha: espacios.find(e => e.id === r.cancha_id)?.nombre || r.cancha_id,
          deporte: DEPORTES[r.deporte]?.nombre || r.deporte,
          origen: ORIGENES[r.origen]?.nombre || r.origen,
          origenColor: ORIGENES[r.origen]?.color,
          asistencia: r.asistencia,
          falta: r.asistencia === 'falta',
          totalCancha, totalConsumo,
          total: redondear(totalCancha + totalConsumo),
          pagado,
          saldo: redondear(totalCancha + totalConsumo - pagado)
        };
      })
      .filter(d => d.saldo > 0.009);

    const faltas    = deudas.filter(d => d.falta);
    const jugadosNo = deudas.filter(d => !d.falta);

    /* Quién debe: el mismo teléfono repitiendo es el dato que le sirve al dueño */
    const porCliente = {};
    deudas.forEach(d => {
      const k = d.telefono || d.cliente;
      if (!porCliente[k]) porCliente[k] = { cliente: d.cliente, telefono: d.telefono, turnos: 0, faltas: 0, deuda: 0 };
      porCliente[k].turnos++;
      if (d.falta) porCliente[k].faltas++;
      porCliente[k].deuda = redondear(porCliente[k].deuda + d.saldo);
    });

    res.json({
      desde, hasta,
      totalSinCobrar: redondear(deudas.reduce((s, d) => s + d.saldo, 0)),
      perdidoEnFaltas: redondear(faltas.reduce((s, d) => s + d.saldo, 0)),
      cantidadFaltas: faltas.length,
      cantidadSinCobrar: jugadosNo.length,
      faltas, jugadosSinCobrar: jugadosNo,
      porCliente: Object.values(porCliente).sort((a, b) => b.deuda - a.deuda)
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/admin/dashboard', async (_req, res) => {
  try {
    const h     = hoy();
    const dias  = Array.from({ length: 7 }, (_, i) => hace(6 - i));
    const dPrev = Array.from({ length: 7 }, (_, i) => hace(13 - i));

    const [resHoy, pagosHoy, consumosHoy, pagosSem, pagosPrev, sociosActivos, espacios] = await Promise.all([
      Reserva.findAll({ where: { fecha: h, estado_reserva: 'confirmada' }, raw: true }),
      pagosEntre(h, h),
      consumosEntre(h, h),
      pagosEntre(dias[0], dias[6]),
      pagosEntre(dPrev[0], dPrev[6]),
      Socio.count({ where: { activo: true } }),
      getEspacios()
    ]);

    const ingresosHoy = redondear(pagosHoy.reduce((s, p) => s + p.monto, 0));
    const buffetHoy   = redondear(consumosHoy.reduce((s, c) => s + c.total, 0));
    const facturado   = redondear(resHoy.filter(r => r.origen !== 'bloqueo').reduce((s, r) => s + (r.monto || 0), 0) + buffetHoy);
    const ingSemana   = redondear(pagosSem.reduce((s, p) => s + p.monto, 0));
    const ingPrev     = redondear(pagosPrev.reduce((s, p) => s + p.monto, 0));
    const variacion   = ingPrev > 0 ? Math.round(((ingSemana - ingPrev) / ingPrev) * 100) : 0;

    const ahora      = new Date();
    const horaActual = `${String(ahora.getHours()).padStart(2, '0')}:00`;
    const proxHora   = `${String(ahora.getHours() + 1).padStart(2, '0')}:00`;
    const canchasAhora = espacios.map(e => {
      const jugando = resHoy.find(r => r.cancha_id === e.id && r.hora_inicio <= horaActual && r.hora_fin > horaActual);
      const prox    = resHoy.find(r => r.cancha_id === e.id && r.hora_inicio === proxHora);
      return { cancha: e.id, nombre: e.nombre, tipo: e.tipo, deporte: e.deporte, jugando: jugando || null, proximo: prox || null };
    });

    res.json({
      ingresosHoy, facturadoHoy: facturado, porCobrarHoy: redondear(facturado - ingresosHoy), buffetHoy,
      turnosHoy: resHoy.length,
      pagadas:    resHoy.filter(r => r.estado_pago === 'pagado').length,
      parciales:  resHoy.filter(r => r.estado_pago === 'parcial').length,
      pendientes: resHoy.filter(r => r.estado_pago === 'pendiente').length,
      faltasHoy:  resHoy.filter(r => r.asistencia === 'falta').length,
      sociosActivos, ingSemana, variacion,
      porMetodo: acumularMetodos(pagosHoy),
      canchasAhora, horaActual,
      alertas: {
        pendientesPago: resHoy.filter(r => r.estado_pago !== 'pagado').length,
        sinReservasHoy: espacios.length - new Set(resHoy.map(r => r.cancha_id)).size,
        faltas: resHoy.filter(r => r.asistencia === 'falta').length
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
