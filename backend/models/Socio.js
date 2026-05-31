const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Socio = sequelize.define('Socio', {
  id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  nombre:        { type: DataTypes.STRING, allowNull: false },
  email:         { type: DataTypes.STRING, defaultValue: '' },
  telefono:      { type: DataTypes.STRING, allowNull: false, unique: true },
  puntos:        { type: DataTypes.INTEGER, defaultValue: 0 },
  ultimaReserva: { type: DataTypes.DATE, defaultValue: null },
  metodoPago:    { type: DataTypes.STRING, defaultValue: null },
  totalGastado:  { type: DataTypes.FLOAT, defaultValue: 0 },
  activo:        { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
  tableName: 'socios',
  timestamps: true
});

module.exports = Socio;
