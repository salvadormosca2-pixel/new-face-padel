const { DataTypes } = require('sequelize');
const sequelize = require('../db');

/*
  La cuenta abierta de una mesa: se abre cuando se sientan, acumula
  consumiciones y pagos, y se cierra recién cuando el saldo queda en cero.

  Una mesa no puede tener dos cuentas abiertas a la vez — eso lo garantiza
  un índice único parcial que se crea al arrancar el servidor. Sin eso,
  dos mozos tocando la misma mesa abren dos cuentas y la mitad del consumo
  queda en una cuenta que nadie cobra.
*/
const Cuenta = sequelize.define('Cuenta', {
  id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  mesaId:         { type: DataTypes.INTEGER, allowNull: false },
  mesaNombre:     { type: DataTypes.STRING, defaultValue: '' },
  estado:         { type: DataTypes.STRING, allowNull: false, defaultValue: 'abierta' },
  comensales:     { type: DataTypes.INTEGER, defaultValue: 0 },
  nota:           { type: DataTypes.STRING, defaultValue: '' },
  fecha:          { type: DataTypes.STRING(10), allowNull: false },

  abiertaPorId:   { type: DataTypes.INTEGER, defaultValue: null },
  abiertaPor:     { type: DataTypes.STRING, defaultValue: '' },
  abiertaEn:      { type: DataTypes.DATE, defaultValue: DataTypes.NOW },

  cerradaPorId:   { type: DataTypes.INTEGER, defaultValue: null },
  cerradaPor:     { type: DataTypes.STRING, defaultValue: '' },
  cerradaEn:      { type: DataTypes.DATE, defaultValue: null }
}, {
  tableName: 'cuentas',
  timestamps: true,
  indexes: [
    { fields: ['mesaId'] },
    { fields: ['estado'] },
    { fields: ['fecha'] }
  ]
});

module.exports = Cuenta;
