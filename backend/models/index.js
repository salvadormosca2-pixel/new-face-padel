const sequelize   = require('../db');
const Reserva     = require('./Reserva');
const Socio       = require('./Socio');
const Torneo      = require('./Torneo');
const Profesor    = require('./Profesor');
const ClubConfig  = require('./ClubConfig');
const Premio      = require('./Premio');
const Canje       = require('./Canje');
const Espacio     = require('./Espacio');
const Usuario     = require('./Usuario');
const Auditoria   = require('./Auditoria');
const Producto    = require('./Producto');
const Consumicion = require('./Consumicion');
const Pago        = require('./Pago');
const Mesa        = require('./Mesa');
const Cuenta      = require('./Cuenta');
const TurnoFijo   = require('./TurnoFijo');
const Comanda     = require('./Comanda');

Canje.belongsTo(Premio, { foreignKey: 'premioId', as: 'premio' });

Consumicion.belongsTo(Reserva, { foreignKey: 'reservaId', as: 'reserva' });
Reserva.hasMany(Consumicion, { foreignKey: 'reservaId', as: 'consumiciones' });

Pago.belongsTo(Reserva, { foreignKey: 'reservaId', as: 'reserva' });
Reserva.hasMany(Pago, { foreignKey: 'reservaId', as: 'pagos' });

TurnoFijo.hasMany(Reserva, { foreignKey: 'turno_fijo_id', as: 'reservas' });
Reserva.belongsTo(TurnoFijo, { foreignKey: 'turno_fijo_id', as: 'turnoFijo' });

Cuenta.belongsTo(Mesa, { foreignKey: 'mesaId', as: 'mesa' });
Mesa.hasMany(Cuenta, { foreignKey: 'mesaId', as: 'cuentas' });
Comanda.hasMany(Consumicion, { foreignKey: 'comandaId', as: 'items' });
Consumicion.belongsTo(Comanda, { foreignKey: 'comandaId', as: 'comanda' });

Cuenta.hasMany(Consumicion, { foreignKey: 'cuentaId', as: 'consumiciones' });
Cuenta.hasMany(Pago, { foreignKey: 'cuentaId', as: 'pagos' });

module.exports = {
  sequelize, Reserva, Socio, Torneo, Profesor, ClubConfig, Premio, Canje,
  Espacio, Usuario, Auditoria, Producto, Consumicion, Pago, Mesa, Cuenta, TurnoFijo, Comanda
};
