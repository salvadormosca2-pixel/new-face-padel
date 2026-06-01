const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Reserva = sequelize.define('Reserva', {
  id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  fecha:            { type: DataTypes.STRING(10), allowNull: false },
  hora_inicio:      { type: DataTypes.STRING(5), allowNull: false, defaultValue: '' },
  hora_fin:         { type: DataTypes.STRING(5), allowNull: false, defaultValue: '' },
  duracion_minutos: { type: DataTypes.INTEGER, defaultValue: 60 },
  cancha_id:        { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  cliente_nombre:   { type: DataTypes.STRING, allowNull: false, defaultValue: '' },
  cliente_telefono: { type: DataTypes.STRING, defaultValue: '' },
  estado_pago:      { type: DataTypes.STRING, defaultValue: 'pendiente' },
  estado_reserva:   { type: DataTypes.STRING, defaultValue: 'confirmada' },
  metodo_pago:      { type: DataTypes.STRING, defaultValue: null },
  monto:            { type: DataTypes.FLOAT, defaultValue: 0 },
  claveUnica:       { type: DataTypes.STRING, allowNull: false, unique: true }
}, {
  tableName: 'reservas',
  timestamps: true,
  indexes: [
    { fields: ['fecha', 'cancha_id'] },
    { fields: ['estado_pago', 'fecha'] },
    { fields: ['cliente_telefono'] },
    { fields: ['estado_reserva'] }
  ]
});

module.exports = Reserva;
