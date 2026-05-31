const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Premio = sequelize.define('Premio', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  nombre:      { type: DataTypes.STRING, allowNull: false },
  descripcion: { type: DataTypes.TEXT, defaultValue: '' },
  icono:       { type: DataTypes.STRING, defaultValue: '' },
  puntos:      { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
  stock:       { type: DataTypes.INTEGER, defaultValue: -1 },
  activo:      { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
  tableName: 'premios',
  timestamps: true
});

module.exports = Premio;
