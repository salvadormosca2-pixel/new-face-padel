/*
  La cuenta de un turno.

  Un turno tiene: precio de cancha + consumiciones del buffet.
  Contra eso se registran pagos parciales, uno por persona:
  Salvador 7000 efectivo, Nacho 7000 transferencia.
  estado_pago se deriva de la suma, nunca se setea a mano.
*/
const Reserva     = require('../models/Reserva');
const Consumicion = require('../models/Consumicion');
const Pago        = require('../models/Pago');
const { ORIGENES_NO_FACTURABLES } = require('./espacios');

const METODOS = ['efectivo', 'transferencia', 'mercadopago', 'tarjeta'];

const METODOS_INFO = {
  efectivo:      { nombre: 'Efectivo',      emoji: '💵', color: '#00E58A' },
  transferencia: { nombre: 'Transferencia', emoji: '🏦', color: '#4DA3FF' },
  mercadopago:   { nombre: 'MercadoPago',   emoji: '💳', color: '#B57BFF' },
  tarjeta:       { nombre: 'Tarjeta',       emoji: '🪪', color: '#FF8A3D' }
};

function redondear(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

/* Cuenta completa de una reserva, con su detalle de consumos y pagos. */
async function cuentaDeReserva(reservaId) {
  const reserva = await Reserva.findByPk(reservaId);
  if (!reserva) return null;

  const [consumiciones, pagos] = await Promise.all([
    Consumicion.findAll({ where: { reservaId, anulada: false }, order: [['id', 'ASC']], raw: true }),
    Pago.findAll({ where: { reservaId, anulado: false }, order: [['id', 'ASC']], raw: true })
  ]);

  const facturable   = !ORIGENES_NO_FACTURABLES.includes(reserva.origen);
  const totalCancha  = facturable ? (reserva.monto || 0) : 0;
  const totalConsumo = redondear(consumiciones.reduce((s, c) => s + (c.total || 0), 0));
  const totalAPagar  = redondear(totalCancha + totalConsumo);
  const totalPagado  = redondear(pagos.reduce((s, p) => s + (p.monto || 0), 0));
  const saldo        = redondear(totalAPagar - totalPagado);

  const porMetodo = {};
  METODOS.forEach(m => { porMetodo[m] = 0; });
  pagos.forEach(p => { if (porMetodo[p.metodo] !== undefined) porMetodo[p.metodo] = redondear(porMetodo[p.metodo] + p.monto); });

  return {
    reservaId: reserva.id,
    facturable,
    totalCancha, totalConsumo, totalAPagar, totalPagado, saldo,
    porMetodo, consumiciones, pagos
  };
}

/*
  La cuenta de una mesa. Misma aritmética que un turno, sin precio de cancha:
  lo que se consumió menos lo que se pagó.
*/
async function cuentaDeMesa(cuentaId) {
  const [consumiciones, pagos] = await Promise.all([
    Consumicion.findAll({ where: { cuentaId, anulada: false }, order: [['id', 'ASC']], raw: true }),
    Pago.findAll({ where: { cuentaId, anulado: false }, order: [['id', 'ASC']], raw: true })
  ]);

  const totalConsumo = redondear(consumiciones.reduce((s, c) => s + (c.total || 0), 0));
  const totalPagado  = redondear(pagos.reduce((s, p) => s + (p.monto || 0), 0));

  const porMetodo = {};
  METODOS.forEach(m => { porMetodo[m] = 0; });
  pagos.forEach(p => { if (porMetodo[p.metodo] !== undefined) porMetodo[p.metodo] = redondear(porMetodo[p.metodo] + p.monto); });

  return {
    cuentaId,
    totalCancha: 0, totalConsumo,
    totalAPagar: totalConsumo,
    totalPagado,
    saldo: redondear(totalConsumo - totalPagado),
    porMetodo, consumiciones, pagos
  };
}

/*
  Recalcula estado_pago / metodo_pago de la reserva a partir de sus pagos.
  pagado | parcial | pendiente. metodo_pago = 'mixto' si se usó más de uno.
*/
async function recalcularEstadoPago(reservaId) {
  const cuenta = await cuentaDeReserva(reservaId);
  if (!cuenta) return null;

  const usados = Object.entries(cuenta.porMetodo).filter(([, v]) => v > 0).map(([k]) => k);

  let estado;
  if (cuenta.totalAPagar > 0 && cuenta.saldo <= 0.009) estado = 'pagado';
  else if (cuenta.totalPagado > 0)                      estado = 'parcial';
  else                                                  estado = 'pendiente';

  const metodo = usados.length === 0 ? null : usados.length === 1 ? usados[0] : 'mixto';

  await Reserva.update(
    { estado_pago: estado, metodo_pago: metodo },
    { where: { id: reservaId } }
  );

  return { ...cuenta, estado_pago: estado, metodo_pago: metodo };
}

module.exports = { METODOS, METODOS_INFO, cuentaDeReserva, cuentaDeMesa, recalcularEstadoPago, redondear };
