/*
  Ingredientes y agregados de un producto.

  El pedido guarda qué se tocó ("sin ketchup, con queso extra") y cuánto sumó,
  para que la cocina lo lea y el total salga bien sin inventar precios a mano.
*/
const Producto = require('../models/Producto');

function redondear(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

/*
  Valida las opciones elegidas contra las que el producto realmente ofrece.
  Nada que no esté en el catálogo entra: si no, cualquiera manda un agregado
  de precio negativo y se descuenta la comida.
*/
function resolverOpciones(producto, elegidas) {
  const catalogo = Array.isArray(producto.opciones) ? producto.opciones : [];
  if (!Array.isArray(elegidas) || elegidas.length === 0 || catalogo.length === 0) {
    return { opciones: [], extra: 0, detalle: '' };
  }

  const nombres = elegidas.map(o => (typeof o === 'string' ? o : o?.nombre)).filter(Boolean);
  const validas = catalogo.filter(c => nombres.includes(c.nombre));

  const extra = redondear(validas.reduce((s, o) => s + (Number(o.precio) > 0 ? Number(o.precio) : 0), 0));

  return {
    opciones: validas.map(o => ({ nombre: o.nombre, precio: Number(o.precio) || 0 })),
    extra,
    detalle: validas.map(o => o.nombre).join(', ')
  };
}

/* Precio final de una línea: base del producto + los agregados elegidos */
function precioLinea(producto, elegidas, cantidad) {
  const { opciones, extra, detalle } = resolverOpciones(producto, elegidas);
  const unitario = redondear(producto.precio + extra);
  return { opciones, detalle, precioUnitario: unitario, total: redondear(unitario * cantidad) };
}

const AMBITOS = ['ambos', 'cancha', 'mesa'];

/* ¿Este producto se ofrece en este lugar? */
function seOfreceEn(producto, donde) {
  const a = producto.ambito || 'ambos';
  return a === 'ambos' || a === donde;
}

async function productosDe(donde, { soloActivos = true } = {}) {
  const where = soloActivos ? { activo: true } : {};
  const todos = await Producto.findAll({ where, order: [['orden', 'ASC'], ['nombre', 'ASC']], raw: true });
  return donde ? todos.filter(p => seOfreceEn(p, donde)) : todos;
}

module.exports = { resolverOpciones, precioLinea, seOfreceEn, productosDe, AMBITOS, redondear };
