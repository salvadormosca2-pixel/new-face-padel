const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Canje = sequelize.define('Canje', {
  id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  socioTelefono: { type: DataTypes.STRING, allowNull: false },
  socioNombre:   { type: DataTypes.STRING, defaultValue: '' },
  premioId:      { type: DataTypes.INTEGER, allowNull: false },
  premioNombre:  { type: DataTypes.STRING, allowNull: false },
  puntosUsados:  { type: DataTypes.INTEGER, allowNull: false },
  estado:        { type: DataTypes.STRING, defaultValue: 'pendiente', validate: { isIn: [['pendiente', 'entregado', 'cancelado']] } }
}, {
  tableName: 'canjes',
  timestamps: true,
  indexes: [
    { fields: ['socioTelefono', 'createdAt'] }
  ]
});

module.exports = Canje;
