const { DataTypes } = require('sequelize');
const sequelize = require('../db');

/*
  Una mesa del salón. Es a la comida lo que una cancha es al juego:
  un lugar que se ocupa, acumula consumo y se cobra.
*/
const Mesa = sequelize.define('Mesa', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  nombre:     { type: DataTypes.STRING, allowNull: false },
  zona:       { type: DataTypes.STRING, defaultValue: 'Salón' },
  capacidad:  { type: DataTypes.INTEGER, defaultValue: 4 },
  activa:     { type: DataTypes.BOOLEAN, defaultValue: true },
  orden:      { type: DataTypes.INTEGER, defaultValue: 0 }
}, {
  tableName: 'mesas',
  timestamps: true,
  indexes: [{ fields: ['activa'] }, { fields: ['zona'] }]
});

module.exports = Mesa;
