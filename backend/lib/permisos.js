/*
  Roles, permisos y firma de acciones.

  El PIN se pide DESPUES de la accion: el panel arma la operacion, el usuario la
  ejecuta y recien ahi el modal pregunta "quien fue" + PIN. Por eso toda mutacion
  sensible viaja con { usuarioId, pin } en el body y se valida aca antes de commitear.
*/
const Usuario   = require('../models/Usuario');
const Auditoria = require('../models/Auditoria');
const { hoyClub } = require('./fechas');

const PERMISOS_EMPLEADO = [
  'reserva.crear',
  'reserva.editar',
  'reserva.asistencia',
  'cobro.registrar',
  'consumicion.crear',
  'caja.ver_turno'
];

const PERMISOS_JEFE = [
  ...PERMISOS_EMPLEADO,
  'reserva.liberar',
  'cobro.anular',
  'consumicion.anular',
  'producto.editar',
  'caja.ver',
  'caja.cerrar'
];

const ROLES = {
  empleado: { nombre: 'Empleado', nivel: 1, permisos: PERMISOS_EMPLEADO },
  jefe:     { nombre: 'Jefe',     nivel: 2, permisos: PERMISOS_JEFE },
  dueno:    { nombre: 'Dueño',    nivel: 3, permisos: ['*'] }
};

const ACCIONES = {
  'reserva.crear':      'Cargar turno',
  'reserva.editar':     'Editar turno',
  'reserva.liberar':    'Liberar turno',
  'reserva.asistencia': 'Marcar asistencia / falta',
  'cobro.registrar':    'Registrar cobro',
  'cobro.anular':       'Anular cobro',
  'consumicion.crear':  'Cargar consumicion',
  'consumicion.anular': 'Anular consumicion',
  'producto.editar':    'Editar productos del buffet',
  'caja.ver':           'Ver caja completa',
  'caja.ver_turno':     'Ver caja del turno propio',
  'caja.cerrar':        'Cerrar caja',
  'espacio.editar':     'Editar canchas y precios',
  'usuario.editar':     'Administrar personal',
  'auditoria.ver':      'Ver auditoria'
};

function permisosDe(rol) {
  const r = ROLES[rol];
  if (!r) return [];
  return r.permisos.includes('*')
    ? Object.keys(ACCIONES)
    : r.permisos;
}

function puede(rol, permiso) {
  const r = ROLES[rol];
  if (!r) return false;
  return r.permisos.includes('*') || r.permisos.includes(permiso);
}

class ErrorAuth extends Error {
  constructor(status, mensaje, extra = {}) {
    super(mensaje);
    this.status = status;
    this.extra  = extra;
  }
}

/* Anti fuerza bruta sobre el PIN: 5 fallas por usuario bloquean 5 minutos. */
const fallos = new Map();
const BLOQUEO_MS   = 5 * 60 * 1000;
const MAX_FALLOS   = 5;

setInterval(() => {
  const ahora = Date.now();
  for (const [k, v] of fallos) if (ahora - v.desde > BLOQUEO_MS) fallos.delete(k);
}, 60 * 1000).unref?.();

/*
  Valida { usuarioId, pin } del body y el permiso pedido.
  Devuelve la instancia de Usuario. Tira ErrorAuth si algo no cierra.
*/
async function autorizar(req, permiso) {
  const usuarioId = req.body?.usuarioId ?? req.query?.usuarioId;
  const pin       = req.body?.pin       ?? req.query?.pin;

  if (!usuarioId || !pin) {
    throw new ErrorAuth(401, 'Falta confirmar quien hizo la accion (usuario + PIN)', { requierePin: true, permiso });
  }

  const usuario = await Usuario.findOne({ where: { id: parseInt(usuarioId), activo: true } });
  if (!usuario) throw new ErrorAuth(401, 'Usuario inexistente o dado de baja');

  const clave = String(usuario.id);
  const f = fallos.get(clave);
  if (f && f.count >= MAX_FALLOS && Date.now() - f.desde < BLOQUEO_MS) {
    const min = Math.ceil((BLOQUEO_MS - (Date.now() - f.desde)) / 60000);
    throw new ErrorAuth(429, `PIN bloqueado por ${min} minuto(s) despues de ${MAX_FALLOS} intentos fallidos`);
  }

  if (!Usuario.verificarPin(pin, usuario.pinHash)) {
    const prev = fallos.get(clave);
    if (!prev || Date.now() - prev.desde > BLOQUEO_MS) fallos.set(clave, { desde: Date.now(), count: 1 });
    else prev.count++;
    throw new ErrorAuth(401, 'PIN incorrecto');
  }
  fallos.delete(clave);

  if (permiso && !puede(usuario.rol, permiso)) {
    throw new ErrorAuth(403, `${usuario.nombre} (${ROLES[usuario.rol]?.nombre || usuario.rol}) no tiene permiso para: ${ACCIONES[permiso] || permiso}`);
  }

  await usuario.update({ ultimoAcceso: new Date() });
  return usuario;
}

function hoyStr() { return hoyClub(); }

/*
  Deja el rastro. usuario puede ser null (bot de WhatsApp, web publica, sistema).
*/
async function auditar(usuario, datos) {
  try {
    await Auditoria.create({
      usuarioId:     usuario?.id || null,
      usuarioNombre: usuario?.nombre || datos.actor || 'Sistema',
      usuarioRol:    usuario?.rol || datos.actorRol || 'sistema',
      accion:        datos.accion,
      entidad:       datos.entidad || '',
      entidadId:     String(datos.entidadId ?? ''),
      descripcion:   datos.descripcion || '',
      monto:         datos.monto || 0,
      detalle:       datos.detalle || {},
      fecha:         datos.fecha || hoyStr()
    });
  } catch (err) {
    console.error('Auditoria ERROR:', err.message);
  }
}

/* Traduce un ErrorAuth (o cualquier otro) a respuesta HTTP. */
function responderError(res, err) {
  if (err instanceof ErrorAuth) {
    return res.status(err.status).json({ error: err.message, ...err.extra });
  }
  console.error(err);
  return res.status(500).json({ error: err.message });
}

module.exports = { ROLES, ACCIONES, PERMISOS_EMPLEADO, PERMISOS_JEFE, permisosDe, puede, autorizar, auditar, ErrorAuth, responderError, hoyStr };
