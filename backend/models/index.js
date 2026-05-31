const sequelize  = require('../db');
const Reserva    = require('./Reserva');
const Socio      = require('./Socio');
const Torneo     = require('./Torneo');
const Profesor   = require('./Profesor');
const ClubConfig = require('./ClubConfig');
const Premio     = require('./Premio');
const Canje      = require('./Canje');

Canje.belongsTo(Premio, { foreignKey: 'premioId', as: 'premio' });

module.exports = { sequelize, Reserva, Socio, Torneo, Profesor, ClubConfig, Premio, Canje };
