const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Torneo = sequelize.define('Torneo', {
  id:                { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  nombre:            { type: DataTypes.STRING, allowNull: false },
  fecha:             { type: DataTypes.STRING(10), allowNull: false },
  descripcion:       { type: DataTypes.TEXT, defaultValue: '' },
  imagen:            { type: DataTypes.TEXT, defaultValue: '' },
  estado:            { type: DataTypes.STRING, defaultValue: 'inscripcion' },
  inscripciones:     { type: DataTypes.JSONB, defaultValue: [] },
  grupos:            { type: DataTypes.JSONB, defaultValue: {} },
  bracket:           { type: DataTypes.JSONB, defaultValue: [] },
  campeon:           { type: DataTypes.STRING, defaultValue: null },
  cantidadJugadores: { type: DataTypes.INTEGER, defaultValue: 0 }
}, {
  tableName: 'torneos',
  timestamps: true
});

module.exports = Torneo;
