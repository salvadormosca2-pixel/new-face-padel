const { DataTypes } = require('sequelize');
const sequelize = require('../db');

/*
  Catalogo del buffet / kiosco. Se toca el producto en la cancha y se carga la consumicion.
*/
const Producto = sequelize.define('Producto', {
  id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  nombre:        { type: DataTypes.STRING, allowNull: false },
  /* Foto (data URL o URL) y descripción para la carta y la ficha */
  imagen:        { type: DataTypes.TEXT, defaultValue: '' },
  descripcion:   { type: DataTypes.TEXT, defaultValue: '' },
  categoria:     { type: DataTypes.STRING, defaultValue: 'bebida' },
  emoji:         { type: DataTypes.STRING, defaultValue: '🥤' },
  precio:        { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  costo:         { type: DataTypes.FLOAT, defaultValue: 0 },
  controlaStock: { type: DataTypes.BOOLEAN, defaultValue: true },
  stock:         { type: DataTypes.INTEGER, defaultValue: 0 },
  stockMinimo:   { type: DataTypes.INTEGER, defaultValue: 5 },
  activo:        { type: DataTypes.BOOLEAN, defaultValue: true },

  /*
    Dónde se ofrece: 'ambos' | 'cancha' | 'mesa'.
    Una paleta de alquiler no va en la carta de la mesa, y una pizza
    tampoco tiene por qué aparecer al cobrar una cancha.
  */
  ambito:        { type: DataTypes.STRING, defaultValue: 'ambos' },

  /*
    Quién lo prepara: 'cocina' pasa por la pantalla del cocinero,
    'barra' lo sirve el mismo mozo, 'directo' es algo de góndola que
    se entrega en el momento y no genera trabajo de nadie.
  */
  estacion:      { type: DataTypes.STRING, defaultValue: 'directo' },

  /*
    Ingredientes y agregados que se pueden tocar al pedirlo:
    [{ nombre: 'Sin ketchup', precio: 0 }, { nombre: 'Queso extra', precio: 1200 }]
    Los de precio 0 son quitar algo; los de precio > 0 suman al total.
  */
  opciones:      { type: DataTypes.JSONB, defaultValue: [] },
  orden:         { type: DataTypes.INTEGER, defaultValue: 0 }
}, {
  tableName: 'productos',
  timestamps: true,
  indexes: [{ fields: ['activo'] }, { fields: ['categoria'] }]
});

module.exports = Producto;
