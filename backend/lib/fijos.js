/*
  Materialización de los turnos fijos.

  La regla vive en turnos_fijos; lo que se ve en la grilla son reservas
  comunes con origen 'fijo' y turno_fijo_id apuntando a la regla. Así nada
  del resto del sistema —disponibilidad, caja, bot— necesita saber que existen.

  Se generan con HORIZONTE_DIAS de anticipación y se extienden solas al arrancar
  el servidor y una vez por día.
*/
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const Reserva   = require('../models/Reserva');
const TurnoFijo = require('../models/TurnoFijo');
const { getEspacio } = require('./espacios');
const { hoyClub } = require('./fechas');

const HORIZONTE_DIAS = 56;   /* ocho semanas */

const DIAS_NOMBRE = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DIAS_CORTO  = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function timeToMin(t) { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; }
function minToTime(m) { const h = Math.floor(m / 60) % 24; return String(h).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }

function sumarDias(fecha, n) {
  const d = new Date(fecha + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function diaSemana(fecha) { return new Date(fecha + 'T12:00:00').getDay(); }

/* Fechas que le tocan a esta regla entre dos límites */
function fechasDe(fijo, desde, hasta) {
  const dias = (fijo.dias || []).map(Number);
  if (!dias.length) return [];

  const inicio = fijo.desde > desde ? fijo.desde : desde;
  const fin    = fijo.hasta && fijo.hasta < hasta ? fijo.hasta : hasta;

  const salida = [];
  for (let f = inicio; f <= fin; f = sumarDias(f, 1)) {
    if (dias.includes(diaSemana(f))) salida.push(f);
  }
  return salida;
}

function seSuperponen(r, inicioMin, finMin) {
  const rIni = timeToMin(r.hora_inicio);
  let   rFin = timeToMin(r.hora_fin);
  if (rFin <= rIni) rFin += 1440;
  const fin = finMin <= inicioMin ? finMin + 1440 : finMin;
  return rIni < fin && rFin > inicioMin;
}

/*
  Genera las reservas que falten de una regla.
  Nunca pisa un turno existente: si la cancha ya está tomada ese día, lo saltea
  y lo devuelve como choque para que alguien lo resuelva a mano.
*/
async function generarReservas(fijo, { desde, hasta } = {}) {
  if (!fijo.activo) return { creadas: [], choques: [] };

  const inicio = desde || hoyClub();
  const fin    = hasta || sumarDias(hoyClub(), HORIZONTE_DIAS);
  const fechas = fechasDe(fijo, inicio, fin);
  if (!fechas.length) return { creadas: [], choques: [] };

  const espacio = await getEspacio(fijo.cancha_id);
  if (!espacio) return { creadas: [], choques: [], error: 'La cancha del fijo ya no existe' };

  const iniMin  = timeToMin(fijo.hora_inicio);
  const finMin  = iniMin + fijo.duracion_minutos;
  const horaFin = minToTime(finMin);
  const monto   = fijo.monto > 0 ? fijo.monto : Math.round(espacio.precioHora * fijo.duracion_minutos / 60);

  /* Todo lo que ya hay en esa cancha en el rango, de una sola consulta */
  const existentes = await Reserva.findAll({
    where: { cancha_id: fijo.cancha_id, fecha: { [Op.in]: fechas }, estado_reserva: 'confirmada' },
    raw: true
  });

  const creadas = [], choques = [];

  for (const fecha of fechas) {
    const delDia = existentes.filter(r => r.fecha === fecha);

    /* Ya generada por esta misma regla: no se duplica */
    if (delDia.some(r => r.turno_fijo_id === fijo.id)) continue;

    const choque = delDia.find(r => seSuperponen(r, iniMin, finMin));
    if (choque) {
      choques.push({
        fecha, hora: fijo.hora_inicio,
        ocupadaPor: choque.cliente_nombre, origen: choque.origen,
        cancha: espacio.nombre
      });
      continue;
    }

    creadas.push({
      fecha, hora_inicio: fijo.hora_inicio, hora_fin: horaFin,
      duracion_minutos: fijo.duracion_minutos,
      cancha_id: fijo.cancha_id, deporte: espacio.deporte,
      cliente_nombre: fijo.cliente_nombre, cliente_telefono: fijo.cliente_telefono || '',
      monto, claveUnica: uuidv4(), origen: 'fijo',
      profesor_id: fijo.profesor_id, profesor_nombre: fijo.profesor_nombre || '',
      notas: fijo.notas || '', turno_fijo_id: fijo.id,
      creado_por_id: fijo.creado_por_id, creado_por: fijo.creado_por || 'Turno fijo'
    });
  }

  if (creadas.length) await Reserva.bulkCreate(creadas);
  return { creadas, choques };
}

/* Borra las reservas futuras de una regla. Las ya jugadas o cobradas no se tocan. */
async function limpiarFuturas(fijoId, desdeFecha) {
  const desde = desdeFecha || hoyClub();
  const [n] = await Reserva.update(
    { estado_reserva: 'cancelada' },
    { where: { turno_fijo_id: fijoId, fecha: { [Op.gte]: desde }, estado_reserva: 'confirmada', estado_pago: 'pendiente' } }
  );
  return n;
}

/* Corre al arrancar y una vez por día: estira el horizonte de todas las reglas activas */
async function extenderTodos() {
  try {
    const fijos = await TurnoFijo.findAll({ where: { activo: true }, raw: true });
    let total = 0, choques = 0;
    for (const f of fijos) {
      const r = await generarReservas(f);
      total   += r.creadas.length;
      choques += r.choques.length;
    }
    if (total || choques) console.log(`Turnos fijos: ${total} generados, ${choques} choque(s)`);
    return { total, choques };
  } catch (err) {
    console.error('Turnos fijos:', err.message);
    return { total: 0, choques: 0 };
  }
}

function descripcion(fijo) {
  const dias = (fijo.dias || []).map(Number).sort().map(d => DIAS_CORTO[d]).join(', ');
  const dur  = fijo.duracion_minutos >= 60
    ? (fijo.duracion_minutos / 60).toFixed(1).replace('.0', '') + 'h'
    : fijo.duracion_minutos + 'min';
  return `${dias} ${fijo.hora_inicio} · ${dur}`;
}

module.exports = {
  HORIZONTE_DIAS, DIAS_NOMBRE, DIAS_CORTO,
  fechasDe, generarReservas, limpiarFuturas, extenderTodos, descripcion, sumarDias, minToTime, timeToMin
};
