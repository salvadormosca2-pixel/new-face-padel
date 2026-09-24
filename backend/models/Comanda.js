const { DataTypes } = require('sequelize');
const sequelize = require('../db');

/*
  Una comanda es lo que el mozo manda a cocina de una vez: la primera vuelta,
  la segunda vuelta, el postre. Cada una tiene su número del día y su reloj.

  Está separada de la cuenta a propósito: la cuenta es la plata (qué debe la
  mesa) y la comanda es el trabajo (qué tiene que salir de la cocina). Se
  cobran juntas pero se cierran en momentos distintos.
*/
const Comanda = sequelize.define('Comanda', {
  id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  numero:        { type: DataTypes.INTEGER, allowNull: false },

  cuentaId:      { type: DataTypes.INTEGER, defaultValue: null },
  reservaId:     { type: DataTypes.INTEGER, defaultValue: null },
  mesaId:        { type: DataTypes.INTEGER, defaultValue: null },
  lugar:         { type: DataTypes.STRING, allowNull: false, defaultValue: '' },

  /* pendiente → preparando → listo → entregado */
  estado:        { type: DataTypes.STRING, allowNull: false, defaultValue: 'pendiente' },
  estacion:      { type: DataTypes.STRING, defaultValue: 'cocina' },

  mozoId:        { type: DataTypes.INTEGER, defaultValue: null },
  mozo:          { type: DataTypes.STRING, defaultValue: '' },
  nota:          { type: DataTypes.STRING, defaultValue: '' },

  fecha:         { type: DataTypes.STRING(10), allowNull: false },
  enviadaEn:     { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  preparandoEn:  { type: DataTypes.DATE, defaultValue: null },
  listoEn:       { type: DataTypes.DATE, defaultValue: null },
  entregadoEn:   { type: DataTypes.DATE, defaultValue: null },

  /* Quién la fue tomando, para que la cocina no se pise entre cocineros */
  tomadaPor:     { type: DataTypes.STRING, defaultValue: '' }
}, {
  tableName: 'comandas',
  timestamps: true,
  indexes: [
    { fields: ['estado'] }, { fields: ['fecha'] },
    { fields: ['cuentaId'] }, { fields: ['mesaId'] }
  ]
});

module.exports = Comanda;
