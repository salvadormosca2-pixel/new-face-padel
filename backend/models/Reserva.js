const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Reserva = sequelize.define('Reserva', {
  id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  fecha:            { type: DataTypes.STRING(10), allowNull: false },
  hora_inicio:      { type: DataTypes.STRING(5), allowNull: false },
  hora_fin:         { type: DataTypes.STRING(5), allowNull: false },
  duracion_minutos: { type: DataTypes.INTEGER, defaultValue: 60 },
  cancha_id:        { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 4 } },
  cliente_nombre:   { type: DataTypes.STRING, allowNull: false },
  cliente_telefono: { type: DataTypes.STRING, defaultValue: '' },
  estado_pago:      { type: DataTypes.STRING, defaultValue: 'pendiente', validate: { isIn: [['pendiente', 'pagado']] } },
  estado_reserva:   { type: DataTypes.STRING, defaultValue: 'confirmada', validate: { isIn: [['confirmada', 'cancelada']] } },
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
