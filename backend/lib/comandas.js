/*
  Comandas: el puente entre el mozo y la cocina.

  El mozo carga a la mesa y eso ya suma a la cuenta. Lo que va a cocina se
  agrupa en una comanda con su número del día y su reloj, para que el cocinero
  vea "Mesa 3, vuelta 2, hace 6 minutos" y no una lista suelta de platos.
*/
const { Op } = require('sequelize');
const Comanda     = require('../models/Comanda');
const Consumicion = require('../models/Consumicion');
const { hoyClub } = require('./fechas');

const ESTADOS = ['pendiente', 'preparando', 'listo', 'entregado'];

const ESTADO_INFO = {
  pendiente:  { nombre: 'Nuevo',      color: '#C8FF00', orden: 0 },
  preparando: { nombre: 'En cocina',  color: '#FFC53D', orden: 1 },
  listo:      { nombre: 'Listo',      color: '#00E58A', orden: 2 },
  entregado:  { nombre: 'Entregado',  color: '#8296B0', orden: 3 }
};

/* Número correlativo por día: lo que el cocinero canta en voz alta */
async function proximoNumero(fecha) {
  const ultima = await Comanda.findOne({
    where: { fecha }, order: [['numero', 'DESC']], raw: true
  });
  return (ultima?.numero || 0) + 1;
}

/*
  Crea la comanda con las líneas que necesitan preparación.
  Lo que sale de la heladera o del kiosco no genera comanda: el mozo lo
  entrega en el momento y llenar la pantalla de cocina con eso la vuelve inútil.
*/
async function crearComanda({ consumiciones, productos, cuenta, reserva, usuario, nota }) {
  const deCocina = consumiciones.filter(c => {
    const p = productos.find(x => x.id === c.productoId);
    return p && (p.estacion === 'cocina' || p.estacion === 'barra');
  });
  if (!deCocina.length) return null;

  const fecha = cuenta?.fecha || reserva?.fecha || hoyClub();
  const hayCocina = deCocina.some(c => {
    const p = productos.find(x => x.id === c.productoId);
    return p && p.estacion === 'cocina';
  });

  const comanda = await Comanda.create({
    numero: await proximoNumero(fecha),
    cuentaId: cuenta?.id || null,
    reservaId: reserva?.id || null,
    mesaId: cuenta?.mesaId || null,
    lugar: cuenta?.mesaNombre || (reserva ? `Cancha ${reserva.cancha_id} · ${reserva.cliente_nombre}` : 'Mostrador'),
    estado: 'pendiente',
    estacion: hayCocina ? 'cocina' : 'barra',
    mozoId: usuario?.id || null, mozo: usuario?.nombre || '',
    nota: nota || '', fecha, enviadaEn: new Date()
  });

  await Consumicion.update(
    { comandaId: comanda.id },
    { where: { id: { [Op.in]: deCocina.map(c => c.id) } } }
  );

  return comanda;
}

/* Marca de tiempo según a dónde pasa, para que el reloj de la pantalla sea real */
function camposDeEstado(estado, usuario) {
  const ahora = new Date();
  if (estado === 'preparando') return { estado, preparandoEn: ahora, tomadaPor: usuario?.nombre || '' };
  if (estado === 'listo')      return { estado, listoEn: ahora, tomadaPor: usuario?.nombre || '' };
  if (estado === 'entregado')  return { estado, entregadoEn: ahora };
  return { estado, preparandoEn: null, listoEn: null, entregadoEn: null };
}

/* Minutos desde que entró: es el dato que ordena la pantalla de cocina */
function minutosDesde(fecha) {
  if (!fecha) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(fecha).getTime()) / 60000));
}

/*
  Semáforo por demora. Un plato de 4 minutos y uno de 20 no pueden verse igual:
  el cocinero tiene que saber de un vistazo cuál se está yendo de tiempo.
*/
function urgencia(minutos) {
  if (minutos >= 20) return 'tarde';
  if (minutos >= 10) return 'demorado';
  return 'normal';
}

module.exports = { ESTADOS, ESTADO_INFO, proximoNumero, crearComanda, camposDeEstado, minutosDesde, urgencia };
