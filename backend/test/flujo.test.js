/* Prueba funcional del flujo completo contra un Postgres en memoria (pg-mem). */
const { newDb } = require('pg-mem');

const db = newDb();

/* Sequelize habla con el driver 'pg': le damos el de pg-mem */
const pgPath = require.resolve('pg');
require.cache[pgPath] = { id: pgPath, filename: pgPath, loaded: true, exports: db.adapters.createPg() };

const { Sequelize } = require('sequelize');
const sequelize = new Sequelize('postgres://u:p@localhost:5432/test', { dialect: 'postgres', logging: false });

/* Y reemplazamos la instancia que abre db.js */
const dbPath = require.resolve('../db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: sequelize };

const models      = require('../models');
const Usuario     = models.Usuario;
const { autorizar, puede } = require('../lib/permisos');
const { cuentaDeReserva, recalcularEstadoPago } = require('../lib/cuentas');
const { invalidarCache } = require('../lib/espacios');

function req(body) { return { body, query: {} }; }
const ok = (c, m) => console.log((c ? '  ok  ' : ' FALLA ') + m);
let fallas = 0;
const chk = (c, m) => { if (!c) fallas++; ok(c, m); };

(async () => {
  await sequelize.sync();
  invalidarCache();

  const { seedEspacios, seedProductos } = require('../lib/seed-nuevos');
  await seedEspacios();
  await seedProductos();

  const dueno    = await Usuario.create({ nombre: 'Salvador', rol: 'dueno',    pinHash: Usuario.hashPin('1111') });
  const jefe     = await Usuario.create({ nombre: 'Nacho',    rol: 'jefe',     pinHash: Usuario.hashPin('2222') });
  const empleado = await Usuario.create({ nombre: 'Lucas',    rol: 'empleado', pinHash: Usuario.hashPin('3333') });

  console.log('\n— Permisos —');
  chk(puede('empleado', 'cobro.registrar'),   'empleado puede cobrar');
  chk(!puede('empleado', 'reserva.liberar'),  'empleado NO puede liberar turnos');
  chk(!puede('empleado', 'caja.ver'),         'empleado NO ve la caja completa');
  chk(puede('jefe', 'reserva.liberar'),       'jefe puede liberar turnos');
  chk(!puede('jefe', 'usuario.editar'),       'jefe NO administra personal');
  chk(puede('dueno', 'usuario.editar'),       'dueño administra personal');

  console.log('\n— PIN —');
  const u = await autorizar(req({ usuarioId: empleado.id, pin: '3333' }), 'cobro.registrar');
  chk(u.nombre === 'Lucas', 'PIN correcto autoriza');
  let err = null;
  try { await autorizar(req({ usuarioId: empleado.id, pin: '9999' }), 'cobro.registrar'); } catch (e) { err = e; }
  chk(err && err.status === 401, 'PIN incorrecto rechazado (401)');
  err = null;
  try { await autorizar(req({ usuarioId: empleado.id, pin: '3333' }), 'reserva.liberar'); } catch (e) { err = e; }
  chk(err && err.status === 403, 'empleado con PIN correcto pero sin permiso -> 403');
  chk(err && /no tiene permiso/.test(err.message), 'el mensaje dice por que: ' + (err && err.message));

  console.log('\n— Turno + consumiciones + pagos divididos —');
  const hoy = new Date().toISOString().split('T')[0];
  const reserva = await models.Reserva.create({
    fecha: hoy, hora_inicio: '19:00', hora_fin: '20:30', duracion_minutos: 90,
    cancha_id: 3, deporte: 'padel', cliente_nombre: 'Salvador', cliente_telefono: '11',
    monto: 6000, claveUnica: 'k1', origen: 'whatsapp',
    creado_por_id: empleado.id, creado_por: 'Lucas'
  });

  const agua = await models.Producto.findOne({ where: { nombre: 'Agua 500ml' } });
  const sandwich = await models.Producto.findOne({ where: { nombre: 'Sándwich' } });
  const stockAguaAntes = agua.stock;

  await models.Consumicion.create({ reservaId: reserva.id, productoId: agua.id, nombre: agua.nombre, cantidad: 2, precioUnitario: agua.precio, total: agua.precio * 2, fecha: hoy, usuarioId: empleado.id, usuarioNombre: 'Lucas' });
  await agua.update({ stock: agua.stock - 2 });
  await models.Consumicion.create({ reservaId: reserva.id, productoId: sandwich.id, nombre: sandwich.nombre, cantidad: 1, precioUnitario: sandwich.precio, total: sandwich.precio, fecha: hoy, usuarioId: empleado.id, usuarioNombre: 'Lucas' });

  let cuenta = await cuentaDeReserva(reserva.id);
  const esperado = 6000 + agua.precio * 2 + sandwich.precio;
  chk(cuenta.totalCancha === 6000, 'cancha 6000');
  chk(cuenta.totalConsumo === agua.precio * 2 + sandwich.precio, 'consumiciones ' + cuenta.totalConsumo);
  chk(cuenta.totalAPagar === esperado, 'total a pagar ' + cuenta.totalAPagar);
  chk(cuenta.saldo === esperado, 'saldo completo antes de cobrar');
  chk((await models.Producto.findByPk(agua.id)).stock === stockAguaAntes - 2, 'stock de agua descontado');

  /* Salvador paga 7000 en efectivo, Nacho el resto por transferencia */
  await models.Pago.create({ reservaId: reserva.id, pagador: 'Salvador', monto: 7000, metodo: 'efectivo', fecha: hoy, usuarioId: empleado.id, usuarioNombre: 'Lucas' });
  cuenta = await recalcularEstadoPago(reserva.id);
  chk(cuenta.estado_pago === 'parcial', 'con un solo pago el turno queda PARCIAL');
  chk(cuenta.saldo === esperado - 7000, 'saldo restante ' + cuenta.saldo);

  await models.Pago.create({ reservaId: reserva.id, pagador: 'Nacho', monto: esperado - 7000, metodo: 'transferencia', fecha: hoy, usuarioId: empleado.id, usuarioNombre: 'Lucas' });
  cuenta = await recalcularEstadoPago(reserva.id);
  chk(cuenta.estado_pago === 'pagado', 'cubierto el total queda PAGADO');
  chk(cuenta.saldo === 0, 'saldo 0');
  chk(cuenta.metodo_pago === 'mixto', 'metodo mixto (efectivo + transferencia)');
  chk(cuenta.porMetodo.efectivo === 7000, 'efectivo 7000');
  chk(cuenta.porMetodo.transferencia === esperado - 7000, 'transferencia ' + cuenta.porMetodo.transferencia);

  console.log('\n— Bloqueo de cancha no factura —');
  const bloqueo = await models.Reserva.create({
    fecha: hoy, hora_inicio: '15:00', hora_fin: '16:00', duracion_minutos: 60,
    cancha_id: 3, deporte: 'padel', cliente_nombre: 'Mantenimiento', monto: 0,
    claveUnica: 'k2', origen: 'bloqueo'
  });
  const cb = await cuentaDeReserva(bloqueo.id);
  chk(cb.facturable === false && cb.totalAPagar === 0, 'un bloqueo no genera deuda');

  console.log('\n— Disponibilidad multideporte —');
  const { calcDisponibilidad } = require('../routes/reservas');
  const padel60  = await calcDisponibilidad(hoy, 60, 'padel');
  const mesa30   = await calcDisponibilidad(hoy, 30, 'tenis_mesa');
  const padel30  = await calcDisponibilidad(hoy, 30, 'padel');
  const beach    = await calcDisponibilidad(hoy, 60, 'beach_volley');
  chk(padel60.length > 0, 'hay turnos de padel de 60min: ' + padel60.length);
  chk(mesa30.length > 0, 'tenis de mesa acepta 30min: ' + mesa30.length);
  chk(padel30.length === 0, 'padel NO acepta 30min (minimo 60)');
  chk(beach.length > 0, 'beach voley disponible: ' + beach.length);
  chk(padel60.every(s => s.canchas.every(c => c.deporte === 'padel')), 'no se mezclan deportes en un slot');
  const ocupado1930 = padel60.find(s => s.hora_inicio === '19:00');
  chk(ocupado1930 ? !ocupado1930.canchas.some(c => c.id === 3) : true, 'la cancha 3 a las 19:00 no aparece libre');

  console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLA(S)`);
  process.exit(fallas === 0 ? 0 : 1);
})().catch(e => { console.error('ERROR:', e.message); console.error(e.stack.split('\n').slice(0,6).join('\n')); process.exit(1); });
