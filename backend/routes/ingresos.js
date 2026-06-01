const express = require('express');
const router  = express.Router();
const { Op }  = require('sequelize');
const Reserva = require('../models/Reserva');
const Socio   = require('../models/Socio');

function hoy()      { return new Date().toISOString().split('T')[0]; }
function hace(dias) { const d = new Date(); d.setDate(d.getDate() - dias); return d.toISOString().split('T')[0]; }

router.get('/api/admin/ingresos/hoy', async (req, res) => {
  try {
    const reservas   = await Reserva.findAll({ where: { fecha: hoy(), estado_reserva: 'confirmada' }, raw: true });
    const pagadas    = reservas.filter(r => r.estado_pago === 'pagado');
    const pendientes = reservas.filter(r => r.estado_pago === 'pendiente');
    const total      = pagadas.reduce((s, r) => s + (r.monto || 0), 0);
    const porMetodo  = { efectivo: 0, mercadopago: 0, transferencia: 0 };
    pagadas.forEach(r => { if (r.metodo_pago && porMetodo.hasOwnProperty(r.metodo_pago)) porMetodo[r.metodo_pago] += r.monto || 0; });
    res.json({ fecha: hoy(), total, pagadas: pagadas.length, pendientes: pendientes.length, totalTurnos: reservas.length, porMetodo });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/admin/ingresos/semana', async (req, res) => {
  try {
    const dias     = Array.from({ length: 7 }, (_, i) => hace(6 - i));
    const diasPrev = Array.from({ length: 7 }, (_, i) => hace(13 - i));
    const [semRes, prevRes] = await Promise.all([
      Reserva.findAll({ where: { fecha: { [Op.in]: dias }, estado_pago: 'pagado', estado_reserva: 'confirmada' }, raw: true }),
      Reserva.findAll({ where: { fecha: { [Op.in]: diasPrev }, estado_pago: 'pagado', estado_reserva: 'confirmada' }, raw: true })
    ]);
    const porDia = dias.map(fecha => ({
      fecha,
      total:    semRes.filter(r => r.fecha === fecha).reduce((s, r) => s + (r.monto || 0), 0),
      reservas: semRes.filter(r => r.fecha === fecha).length
    }));
    const totalSemana = porDia.reduce((s, d) => s + d.total, 0);
    const totalPrevio = prevRes.reduce((s, r) => s + (r.monto || 0), 0);
    const variacion   = totalPrevio > 0 ? Math.round(((totalSemana - totalPrevio) / totalPrevio) * 100) : 0;
    res.json({ porDia, totalSemana, totalPrevio, variacion });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/admin/ingresos/reporte', async (req, res) => {
  try {
    const dias     = Array.from({ length: 7 }, (_, i) => hace(6 - i));
    const reservas = await Reserva.findAll({ where: { fecha: { [Op.in]: dias }, estado_reserva: 'confirmada' }, raw: true });

    const porCancha = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const ingCancha = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const porHora   = {};
    const porMetodo = { efectivo: 0, mercadopago: 0, transferencia: 0 };

    reservas.forEach(r => {
      porCancha[r.cancha_id] = (porCancha[r.cancha_id] || 0) + 1;
      porHora[r.hora_inicio] = (porHora[r.hora_inicio] || 0) + 1;
      if (r.estado_pago === 'pagado') {
        ingCancha[r.cancha_id] = (ingCancha[r.cancha_id] || 0) + (r.monto || 0);
        if (r.metodo_pago && porMetodo.hasOwnProperty(r.metodo_pago)) porMetodo[r.metodo_pago] += r.monto || 0;
      }
    });

    const sortCancha = o => Object.entries(o).sort((a, b) => b[1] - a[1]);
    const sortHora   = Object.entries(porHora).sort((a, b) => b[1] - a[1]);

    res.json({
      porCancha, ingCancha, porHora, porMetodo,
      canchaTop:      { cancha: sortCancha(ingCancha)[0]?.[0],               monto:    sortCancha(ingCancha)[0]?.[1] },
      canchaMenosUso: { cancha: sortCancha(porCancha).reverse()[0]?.[0],     reservas: sortCancha(porCancha).reverse()[0]?.[1] },
      horaPico:       { hora: sortHora[0]?.[0],                               reservas: sortHora[0]?.[1] },
      horaFloja:      { hora: sortHora[sortHora.length - 1]?.[0],             reservas: sortHora[sortHora.length - 1]?.[1] }
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

    const reservas = await Reserva.findAll({
      where: { fecha: { [Op.gte]: desde, [Op.lte]: hasta }, estado_pago: 'pagado', estado_reserva: 'confirmada' },
      raw: true
    });
    const total    = reservas.reduce((s, r) => s + (r.monto || 0), 0);
    const porMetodo    = { efectivo: 0, mercadopago: 0, transferencia: 0 };
    const porDiaSemana = {};
    reservas.forEach(r => {
      if (r.metodo_pago && porMetodo.hasOwnProperty(r.metodo_pago)) porMetodo[r.metodo_pago] += r.monto || 0;
      const dow = ['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado'][new Date(r.fecha + 'T12:00:00').getDay()];
      porDiaSemana[dow] = (porDiaSemana[dow] || 0) + (r.monto || 0);
    });
    const mejor_dia    = Object.entries(porDiaSemana).sort((a, b) => b[1] - a[1])[0]?.[0] || '---';
    const totalMetodos = porMetodo.efectivo + porMetodo.mercadopago + porMetodo.transferencia || 1;
    res.json({
      mes: { total, reservas: reservas.length, promedio: Math.round(total / diasMes), mejor_dia },
      metodos: [
        { nombre: 'Efectivo',      monto: porMetodo.efectivo,      porcentaje: Math.round(porMetodo.efectivo / totalMetodos * 100) },
        { nombre: 'MercadoPago',   monto: porMetodo.mercadopago,   porcentaje: Math.round(porMetodo.mercadopago / totalMetodos * 100) },
        { nombre: 'Transferencia', monto: porMetodo.transferencia, porcentaje: Math.round(porMetodo.transferencia / totalMetodos * 100) },
      ]
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/admin/dashboard', async (req, res) => {
  try {
    const h     = hoy();
    const dias  = Array.from({ length: 7 }, (_, i) => hace(6 - i));
    const dPrev = Array.from({ length: 7 }, (_, i) => hace(13 - i));

    const [resHoy, semRes, prevRes, sociosActivos] = await Promise.all([
      Reserva.findAll({ where: { fecha: h, estado_reserva: 'confirmada' }, raw: true }),
      Reserva.findAll({ where: { fecha: { [Op.in]: dias }, estado_pago: 'pagado', estado_reserva: 'confirmada' }, raw: true }),
      Reserva.findAll({ where: { fecha: { [Op.in]: dPrev }, estado_pago: 'pagado', estado_reserva: 'confirmada' }, raw: true }),
      Socio.count({ where: { activo: true } })
    ]);

    const pagadasHoy  = resHoy.filter(r => r.estado_pago === 'pagado');
    const pendHoy     = resHoy.filter(r => r.estado_pago === 'pendiente');
    const ingresosHoy = pagadasHoy.reduce((s, r) => s + (r.monto || 0), 0);
    const ingSemana   = semRes.reduce((s, r) => s + (r.monto || 0), 0);
    const ingPrev     = prevRes.reduce((s, r) => s + (r.monto || 0), 0);
    const variacion   = ingPrev > 0 ? Math.round(((ingSemana - ingPrev) / ingPrev) * 100) : 0;

    const porMetodo = { efectivo: 0, mercadopago: 0, transferencia: 0 };
    pagadasHoy.forEach(r => { if (r.metodo_pago && porMetodo.hasOwnProperty(r.metodo_pago)) porMetodo[r.metodo_pago] += r.monto || 0; });

    const ahora      = new Date();
    const horaActual = `${String(ahora.getHours()).padStart(2, '0')}:00`;
    const proxHora   = `${String(ahora.getHours() + 1).padStart(2, '0')}:00`;
    const canchasAhora = [1, 2, 3, 4].map(c => {
      const jugando = resHoy.find(r => r.cancha_id === c && r.hora_inicio <= horaActual && r.hora_fin > horaActual);
      const prox    = resHoy.find(r => r.cancha_id === c && r.hora_inicio === proxHora);
      return { cancha: c, tipo: c <= 2 ? 'Cubierta' : 'Al aire libre', jugando: jugando || null, proximo: prox || null };
    });

    res.json({
      ingresosHoy, turnosHoy: resHoy.length, pagadas: pagadasHoy.length, pendientes: pendHoy.length,
      sociosActivos, ingSemana, variacion, porMetodo, canchasAhora, horaActual,
      alertas: {
        pendientesPago: pendHoy.length,
        sinReservasHoy: 4 - new Set(resHoy.map(r => r.cancha_id)).size
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
