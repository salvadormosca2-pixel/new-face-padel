const { DataTypes } = require('sequelize');
const sequelize = require('../db');

/*
  Una linea de consumo cargada a un turno: 2 aguas en la cancha 3, etc.
*/
const Consumicion = sequelize.define('Consumicion', {
  id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  reservaId:      { type: DataTypes.INTEGER, defaultValue: null },
  cuentaId:       { type: DataTypes.INTEGER, defaultValue: null },
  productoId:     { type: DataTypes.INTEGER, defaultValue: null },
  nombre:         { type: DataTypes.STRING, allowNull: false },
  emoji:          { type: DataTypes.STRING, defaultValue: '🥤' },
  cantidad:       { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  precioUnitario: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  total:          { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  /* A qué comanda pertenece y cómo viene de la cocina */
  comandaId:      { type: DataTypes.INTEGER, defaultValue: null },
  estadoCocina:   { type: DataTypes.STRING, defaultValue: 'pendiente' },
  /* Aclaración que escribe el mozo: "jugoso", "para la nena", "sin sal" */
  nota:           { type: DataTypes.STRING, defaultValue: '' },

  /* Ingredientes tocados en este pedido puntual */
  opciones:       { type: DataTypes.JSONB, defaultValue: [] },
  /* "sin ketchup, con queso extra" — lo que lee la cocina y sale en el ticket */
  detalle:        { type: DataTypes.STRING, defaultValue: '' },
  fecha:          { type: DataTypes.STRING(10), defaultValue: '' },
  usuarioId:      { type: DataTypes.INTEGER, defaultValue: null },
  usuarioNombre:  { type: DataTypes.STRING, defaultValue: '' },
  anulada:        { type: DataTypes.BOOLEAN, defaultValue: false }
}, {
  tableName: 'consumiciones',
  timestamps: true,
  indexes: [{ fields: ['reservaId'] }, { fields: ['fecha'] }, { fields: ['anulada'] }]
});

module.exports = Consumicion;
