const { DataTypes } = require('sequelize');
const sequelize = require('../db');

/*
  Un Espacio es cualquier superficie alquilable del club:
  cancha de padel, mesa de tenis de mesa, cancha de pickleball o de beach volley.
  Reserva.cancha_id apunta aca (se mantiene el nombre de la columna por compatibilidad
  con el bot, la web publica y las reservas ya cargadas).
*/
const Espacio = sequelize.define('Espacio', {
  id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  nombre:          { type: DataTypes.STRING, allowNull: false },
  deporte:         { type: DataTypes.STRING, allowNull: false, defaultValue: 'padel' },
  tipo:            { type: DataTypes.STRING, defaultValue: 'Cubierta' },
  precioHora:      { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  duracionMinima:  { type: DataTypes.INTEGER, defaultValue: 60 },
  pasoMinutos:     { type: DataTypes.INTEGER, defaultValue: 30 },
  activo:          { type: DataTypes.BOOLEAN, defaultValue: true },
  orden:           { type: DataTypes.INTEGER, defaultValue: 0 },
  color:           { type: DataTypes.STRING, defaultValue: '#22c55e' }
}, {
  tableName: 'espacios',
  timestamps: true,
  indexes: [{ fields: ['deporte'] }, { fields: ['activo'] }]
});

module.exports = Espacio;
