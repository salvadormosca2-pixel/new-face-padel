const { DataTypes } = require('sequelize');
const sequelize = require('../db');

/*
  Un turno fijo no es una reserva: es la regla que las genera.
  "Los martes y jueves a las 20:00, cancha 2, el grupo de Nacho."

  De la regla salen reservas reales en la grilla (origen 'fijo'), así la
  disponibilidad, el bot y la caja siguen funcionando sin saber que existen
  los fijos. Se materializan con unas semanas de anticipación y se extienden solas.
*/
const TurnoFijo = sequelize.define('TurnoFijo', {
  id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  /* persona | profesor */
  tipo:             { type: DataTypes.STRING, allowNull: false, defaultValue: 'persona' },
  cliente_nombre:   { type: DataTypes.STRING, allowNull: false },
  cliente_telefono: { type: DataTypes.STRING, defaultValue: '' },
  profesor_id:      { type: DataTypes.INTEGER, defaultValue: null },
  profesor_nombre:  { type: DataTypes.STRING, defaultValue: '' },

  cancha_id:        { type: DataTypes.INTEGER, allowNull: false },
  deporte:          { type: DataTypes.STRING, defaultValue: 'padel' },

  /* Días de la semana: 0 domingo … 6 sábado */
  dias:             { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  hora_inicio:      { type: DataTypes.STRING(5), allowNull: false },
  duracion_minutos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 60 },

  /* Vigencia. hasta en null = sin fecha de corte */
  desde:            { type: DataTypes.STRING(10), allowNull: false },
  hasta:            { type: DataTypes.STRING(10), defaultValue: null },

  monto:            { type: DataTypes.FLOAT, defaultValue: 0 },
  notas:            { type: DataTypes.TEXT, defaultValue: '' },
  activo:           { type: DataTypes.BOOLEAN, defaultValue: true },

  creado_por_id:    { type: DataTypes.INTEGER, defaultValue: null },
  creado_por:       { type: DataTypes.STRING, defaultValue: '' }
}, {
  tableName: 'turnos_fijos',
  timestamps: true,
  indexes: [{ fields: ['activo'] }, { fields: ['cancha_id'] }, { fields: ['tipo'] }]
});

module.exports = TurnoFijo;
