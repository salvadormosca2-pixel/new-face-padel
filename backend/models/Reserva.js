const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Reserva = sequelize.define('Reserva', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  fecha:       { type: DataTypes.STRING(10), allowNull: false },
  hora:        { type: DataTypes.STRING(5), allowNull: false },
  cancha:      { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 4 } },
  nombre:      { type: DataTypes.STRING, allowNull: false },
  telefono:    { type: DataTypes.STRING, defaultValue: '' },
  metodoPago:  { type: DataTypes.STRING, allowNull: false, validate: { isIn: [['efectivo', 'mercadopago', 'transferencia']] } },
  estado:      { type: DataTypes.STRING, defaultValue: 'pendiente', validate: { isIn: [['pendiente', 'pagado']] } },
  metodoCobro: { type: DataTypes.STRING, defaultValue: null },
  monto:       { type: DataTypes.FLOAT, defaultValue: 0 },
  claveUnica:  { type: DataTypes.STRING, allowNull: false, unique: true }
}, {
  tableName: 'reservas',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['fecha', 'cancha', 'hora'] },
    { fields: ['estado', 'fecha'] },
    { fields: ['telefono'] }
  ]
});

module.exports = Reserva;
