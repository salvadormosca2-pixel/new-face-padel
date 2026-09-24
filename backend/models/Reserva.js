const { DataTypes } = require('sequelize');
const sequelize = require('../db');

/*
  origen: de donde salio el turno. Define el color en la grilla del panel.
    mostrador | profesor | online | whatsapp | fijo | torneo | bloqueo
  asistencia: pendiente | presente | falta   (la "falta" del que no vino)
  cancha_id: id del Espacio (cancha de padel, mesa de ping pong, pickleball, beach volley)
*/
const Reserva = sequelize.define('Reserva', {
  id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  fecha:            { type: DataTypes.STRING(10), allowNull: false },
  hora_inicio:      { type: DataTypes.STRING(5), allowNull: false, defaultValue: '' },
  hora_fin:         { type: DataTypes.STRING(5), allowNull: false, defaultValue: '' },
  duracion_minutos: { type: DataTypes.INTEGER, defaultValue: 60 },
  cancha_id:        { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  deporte:          { type: DataTypes.STRING, defaultValue: 'padel' },
  cliente_nombre:   { type: DataTypes.STRING, allowNull: false, defaultValue: '' },
  cliente_telefono: { type: DataTypes.STRING, defaultValue: '' },
  estado_pago:      { type: DataTypes.STRING, defaultValue: 'pendiente' },
  estado_reserva:   { type: DataTypes.STRING, defaultValue: 'confirmada' },
  metodo_pago:      { type: DataTypes.STRING, defaultValue: null },
  monto:            { type: DataTypes.FLOAT, defaultValue: 0 },
  origen:           { type: DataTypes.STRING, allowNull: false, defaultValue: 'mostrador' },
  profesor_id:      { type: DataTypes.INTEGER, defaultValue: null },
  profesor_nombre:  { type: DataTypes.STRING, defaultValue: '' },
  asistencia:       { type: DataTypes.STRING, defaultValue: 'pendiente' },
  notas:            { type: DataTypes.TEXT, defaultValue: '' },
  turno_fijo_id:    { type: DataTypes.INTEGER, defaultValue: null },
  creado_por_id:    { type: DataTypes.INTEGER, defaultValue: null },
  creado_por:       { type: DataTypes.STRING, defaultValue: '' },
  claveUnica:       { type: DataTypes.STRING, allowNull: false, unique: true }
}, {
  tableName: 'reservas',
  timestamps: true,
  indexes: [
    { fields: ['fecha', 'cancha_id'] },
    { fields: ['estado_pago', 'fecha'] },
    { fields: ['cliente_telefono'] },
    { fields: ['estado_reserva'] },
    { fields: ['origen'] },
    { fields: ['asistencia'] },
    { fields: ['deporte'] },
    { fields: ['turno_fijo_id'] }
  ]
});

module.exports = Reserva;
