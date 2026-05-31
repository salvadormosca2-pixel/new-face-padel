const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Profesor = sequelize.define('Profesor', {
  id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  nombre:       { type: DataTypes.STRING, allowNull: false },
  especialidad: { type: DataTypes.STRING, allowNull: false },
  experiencia:  { type: DataTypes.STRING, allowNull: false },
  horarios:     { type: DataTypes.STRING, allowNull: false },
  whatsapp:     { type: DataTypes.STRING, allowNull: false },
  imagen:       { type: DataTypes.TEXT, defaultValue: '' },
  alumnos:      { type: DataTypes.INTEGER, defaultValue: 0 },
  rating:       { type: DataTypes.FLOAT, defaultValue: 5.0, validate: { min: 0, max: 5 } },
  gruposEdad:   { type: DataTypes.JSONB, defaultValue: [] },
  niveles:      { type: DataTypes.JSONB, defaultValue: [] }
}, {
  tableName: 'profesores',
  timestamps: true
});

module.exports = Profesor;
