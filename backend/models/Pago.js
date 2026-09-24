const { DataTypes } = require('sequelize');
const sequelize = require('../db');

/*
  Pago parcial de un turno. En padel cada uno paga lo suyo:
  Salvador 7000 efectivo, Nacho 7000 transferencia -> dos filas, mismo turno.
  El turno queda "pagado" cuando la suma de sus pagos cubre cancha + consumiciones.
*/
const Pago = sequelize.define('Pago', {
  id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  reservaId:     { type: DataTypes.INTEGER, defaultValue: null },
  cuentaId:      { type: DataTypes.INTEGER, defaultValue: null },
  pagador:       { type: DataTypes.STRING, defaultValue: '' },
  monto:         { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  metodo:        { type: DataTypes.STRING, allowNull: false, defaultValue: 'efectivo' },
  concepto:      { type: DataTypes.STRING, defaultValue: 'cancha' },
  fecha:         { type: DataTypes.STRING(10), defaultValue: '' },
  usuarioId:     { type: DataTypes.INTEGER, defaultValue: null },
  usuarioNombre: { type: DataTypes.STRING, defaultValue: '' },
  anulado:       { type: DataTypes.BOOLEAN, defaultValue: false },
  nota:          { type: DataTypes.STRING, defaultValue: '' }
}, {
  tableName: 'pagos',
  timestamps: true,
  indexes: [{ fields: ['reservaId'] }, { fields: ['fecha'] }, { fields: ['metodo'] }, { fields: ['anulado'] }]
});

module.exports = Pago;
