const { DataTypes } = require('sequelize');
const sequelize = require('../db');

/*
  Registro inmutable de quien hizo que. Nunca se borra ni se edita.
*/
const Auditoria = sequelize.define('Auditoria', {
  id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  usuarioId:     { type: DataTypes.INTEGER, defaultValue: null },
  usuarioNombre: { type: DataTypes.STRING, defaultValue: 'Sistema' },
  usuarioRol:    { type: DataTypes.STRING, defaultValue: 'sistema' },
  accion:        { type: DataTypes.STRING, allowNull: false },
  entidad:       { type: DataTypes.STRING, defaultValue: '' },
  entidadId:     { type: DataTypes.STRING, defaultValue: '' },
  descripcion:   { type: DataTypes.TEXT, defaultValue: '' },
  monto:         { type: DataTypes.FLOAT, defaultValue: 0 },
  detalle:       { type: DataTypes.JSONB, defaultValue: {} },
  fecha:         { type: DataTypes.STRING(10), defaultValue: '' }
}, {
  tableName: 'auditoria',
  timestamps: true,
  indexes: [{ fields: ['fecha'] }, { fields: ['usuarioId'] }, { fields: ['accion'] }, { fields: ['entidad', 'entidadId'] }]
});

module.exports = Auditoria;
