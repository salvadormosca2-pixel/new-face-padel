/*
  Espacios y deportes del club.

  Todo lo alquilable vive en la tabla espacios: canchas de padel, mesas de tenis de
  mesa, pickleball y beach volley. Se cachea en memoria porque se lee en cada calculo
  de disponibilidad; cualquier alta/baja/edicion invalida el cache.
*/
const Espacio = require('../models/Espacio');

/* Paleta New Face: lima #C8FF00 es la marca y queda solo para el padel. */
const DEPORTES = {
  padel:        { nombre: 'Pádel',          emoji: '🎾', color: '#C8FF00', duraciones: [60, 90, 120] },
  tenis_mesa:   { nombre: 'Tenis de mesa',  emoji: '🏓', color: '#FF8A3D', duraciones: [30, 60, 90] },
  pickleball:   { nombre: 'Pickleball',     emoji: '🥒', color: '#00D4E5', duraciones: [60, 90, 120] },
  beach_volley: { nombre: 'Beach vóley',    emoji: '🏐', color: '#FFC53D', duraciones: [60, 90, 120] }
};

/* Colores de dato: siete tonos distintos, ninguno lima. */
const ORIGENES = {
  mostrador: { nombre: 'Mostrador',   emoji: '🏠', color: '#7DD3FC', descripcion: 'Cargado a mano en el club' },
  profesor:  { nombre: 'Profesor',    emoji: '🎓', color: '#B57BFF', descripcion: 'Clase con profesor' },
  online:    { nombre: 'Online',      emoji: '🌐', color: '#4DA3FF', descripcion: 'Reserva desde la web' },
  whatsapp:  { nombre: 'WhatsApp',    emoji: '💬', color: '#25D366', descripcion: 'Entró por el bot de WhatsApp' },
  fijo:      { nombre: 'Fijo',        emoji: '🔁', color: '#FFC53D', descripcion: 'Grupo fijo / abonado semanal' },
  torneo:    { nombre: 'Torneo',      emoji: '🏆', color: '#FF5A5A', descripcion: 'Cancha tomada por torneo o evento' },
  bloqueo:   { nombre: 'Bloqueado',   emoji: '🚧', color: '#8296B0', descripcion: 'Mantenimiento, lluvia, cancha fuera de servicio' }
};

const ORIGENES_VALIDOS = Object.keys(ORIGENES);
const DEPORTES_VALIDOS = Object.keys(DEPORTES);

/* Origenes que no son un cliente que paga: no cuentan para ingresos ni puntos. */
const ORIGENES_NO_FACTURABLES = ['bloqueo'];

let _cache = null;
let _cacheAt = 0;
const TTL = 60 * 1000;

function invalidarCache() { _cache = null; _cacheAt = 0; }

async function getEspacios({ soloActivos = true, deporte = null, forzar = false } = {}) {
  if (forzar || !_cache || Date.now() - _cacheAt > TTL) {
    _cache = await Espacio.findAll({ order: [['orden', 'ASC'], ['id', 'ASC']], raw: true });
    _cacheAt = Date.now();
  }
  let list = _cache;
  if (soloActivos) list = list.filter(e => e.activo);
  if (deporte)     list = list.filter(e => e.deporte === deporte);
  return list;
}

async function getEspacio(id) {
  const list = await getEspacios({ soloActivos: false });
  return list.find(e => e.id === parseInt(id)) || null;
}

async function calcPrecioEspacio(espacioId, durMin) {
  const e = await getEspacio(espacioId);
  return e ? Math.round(e.precioHora * durMin / 60) : 0;
}

/* Forma legacy que consumen el bot y la web publica (id/nombre/tipo/precioHora). */
function aFormaLegacy(e) {
  return {
    id: e.id,
    nombre: e.nombre,
    tipo: e.tipo,
    precioHora: e.precioHora,
    deporte: e.deporte,
    deporte_nombre: DEPORTES[e.deporte]?.nombre || e.deporte,
    duracionMinima: e.duracionMinima
  };
}

module.exports = {
  DEPORTES, DEPORTES_VALIDOS,
  ORIGENES, ORIGENES_VALIDOS, ORIGENES_NO_FACTURABLES,
  getEspacios, getEspacio, calcPrecioEspacio, invalidarCache, aFormaLegacy
};
