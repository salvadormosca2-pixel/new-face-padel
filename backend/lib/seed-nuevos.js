/*
  Seeds de lo nuevo: espacios multideporte, personal y catalogo del buffet.
  Todos son idempotentes: si ya hay filas, no tocan nada.
*/
const sequelize = require('../db');
const Espacio   = require('../models/Espacio');
const Usuario   = require('../models/Usuario');
const Producto  = require('../models/Producto');
const Mesa      = require('../models/Mesa');

/*
  Los ids 1..4 son las canchas de padel que ya existen: las reservas cargadas
  apuntan ahi por cancha_id, asi que se respetan tal cual.
*/
const ESPACIOS_BASE = [
  { id: 1, nombre: 'Cancha 1',        deporte: 'padel',        tipo: 'Cubierta',      precioHora: 5000, duracionMinima: 60, pasoMinutos: 30, orden: 1,  color: '#22c55e' },
  { id: 2, nombre: 'Cancha 2',        deporte: 'padel',        tipo: 'Cubierta',      precioHora: 5000, duracionMinima: 60, pasoMinutos: 30, orden: 2,  color: '#22c55e' },
  { id: 3, nombre: 'Cancha 3',        deporte: 'padel',        tipo: 'Al aire libre', precioHora: 4000, duracionMinima: 60, pasoMinutos: 30, orden: 3,  color: '#16a34a' },
  { id: 5, nombre: 'Mesa 1',          deporte: 'tenis_mesa',   tipo: 'Cubierta',      precioHora: 2000, duracionMinima: 30, pasoMinutos: 30, orden: 5,  color: '#f97316' },
  { id: 6, nombre: 'Mesa 2',          deporte: 'tenis_mesa',   tipo: 'Cubierta',      precioHora: 2000, duracionMinima: 30, pasoMinutos: 30, orden: 6,  color: '#f97316' },
  { id: 7, nombre: 'Pickleball 1',    deporte: 'pickleball',   tipo: 'Al aire libre', precioHora: 3500, duracionMinima: 60, pasoMinutos: 30, orden: 7,  color: '#06b6d4' },
  { id: 8, nombre: 'Beach Vóley 1',   deporte: 'beach_volley', tipo: 'Al aire libre', precioHora: 4500, duracionMinima: 60, pasoMinutos: 30, orden: 8,  color: '#eab308' }
];

const PRODUCTOS_BASE = [
  /* Bebidas: van tanto en la cancha como en la mesa */
  { nombre: 'Agua 500ml',        categoria: 'bebida',   emoji: '💧', precio: 1500, costo: 500,  stock: 48, stockMinimo: 12, orden: 1,  ambito: 'ambos' },
  { nombre: 'Gatorade',          categoria: 'bebida',   emoji: '🧃', precio: 2500, costo: 900,  stock: 24, stockMinimo: 6,  orden: 2,  ambito: 'ambos' },
  { nombre: 'Gaseosa 500ml',     categoria: 'bebida',   emoji: '🥤', precio: 2200, costo: 800,  stock: 24, stockMinimo: 6,  orden: 3,  ambito: 'ambos' },
  { nombre: 'Cerveza',           categoria: 'bebida',   emoji: '🍺', precio: 3500, costo: 1300, stock: 24, stockMinimo: 6,  orden: 4,  ambito: 'ambos', estacion: 'barra' },

  /* Kiosco: rápido, para la cancha */
  { nombre: 'Alfajor',           categoria: 'comida',   emoji: '🍫', precio: 1800, costo: 700,  stock: 30, stockMinimo: 8,  orden: 5,  ambito: 'ambos' },
  { nombre: 'Barrita de cereal', categoria: 'comida',   emoji: '🍪', precio: 1500, costo: 600,  stock: 30, stockMinimo: 8,  orden: 6,  ambito: 'ambos' },
  { nombre: 'Sándwich',          categoria: 'comida',   emoji: '🥪', precio: 4500, costo: 1700, stock: 10, stockMinimo: 3,  orden: 7,  ambito: 'ambos', estacion: 'cocina' },

  /* Cocina: cada plato con su nombre y sus ingredientes */
  { nombre: 'Hamburguesa simple', categoria: 'comida', emoji: '🍔', precio: 8500, costo: 3200, stock: 20, stockMinimo: 4, orden: 10, ambito: 'mesa', estacion: 'cocina',
    opciones: [ { nombre: 'Sin ketchup', precio: 0 }, { nombre: 'Sin mayonesa', precio: 0 }, { nombre: 'Sin cebolla', precio: 0 }, { nombre: 'Sin tomate', precio: 0 }, { nombre: 'Sin lechuga', precio: 0 }, { nombre: 'Queso extra', precio: 1200 }, { nombre: 'Panceta', precio: 1500 }, { nombre: 'Huevo', precio: 900 }, { nombre: 'Cheddar', precio: 1200 } ] },
  { nombre: 'Hamburguesa con cheddar', categoria: 'comida', emoji: '🍔', precio: 9800, costo: 3800, stock: 18, stockMinimo: 4, orden: 11, ambito: 'mesa', estacion: 'cocina',
    opciones: [ { nombre: 'Sin ketchup', precio: 0 }, { nombre: 'Sin mayonesa', precio: 0 }, { nombre: 'Sin cebolla', precio: 0 }, { nombre: 'Sin tomate', precio: 0 }, { nombre: 'Sin lechuga', precio: 0 }, { nombre: 'Queso extra', precio: 1200 }, { nombre: 'Panceta', precio: 1500 }, { nombre: 'Huevo', precio: 900 }, { nombre: 'Cheddar', precio: 1200 } ] },
  { nombre: 'Hamburguesa completa', categoria: 'comida', emoji: '🍔', precio: 11500, costo: 4400, stock: 15, stockMinimo: 4, orden: 12, ambito: 'mesa', estacion: 'cocina',
    opciones: [ { nombre: 'Sin ketchup', precio: 0 }, { nombre: 'Sin mayonesa', precio: 0 }, { nombre: 'Sin cebolla', precio: 0 }, { nombre: 'Sin tomate', precio: 0 }, { nombre: 'Sin lechuga', precio: 0 }, { nombre: 'Queso extra', precio: 1200 }, { nombre: 'Panceta', precio: 1500 }, { nombre: 'Huevo', precio: 900 }, { nombre: 'Cheddar', precio: 1200 } ] },
  { nombre: 'Hamburguesa doble', categoria: 'comida', emoji: '🍔', precio: 12500, costo: 5200, stock: 12, stockMinimo: 4, orden: 13, ambito: 'mesa', estacion: 'cocina',
    opciones: [ { nombre: 'Sin ketchup', precio: 0 }, { nombre: 'Sin mayonesa', precio: 0 }, { nombre: 'Sin cebolla', precio: 0 }, { nombre: 'Sin tomate', precio: 0 }, { nombre: 'Sin lechuga', precio: 0 }, { nombre: 'Queso extra', precio: 1200 }, { nombre: 'Panceta', precio: 1500 }, { nombre: 'Huevo', precio: 900 }, { nombre: 'Cheddar', precio: 1200 } ] },

  { nombre: 'Lomito simple', categoria: 'comida', emoji: '🥙', precio: 11000, costo: 4200, stock: 15, stockMinimo: 4, orden: 20, ambito: 'mesa', estacion: 'cocina',
    opciones: [ { nombre: 'Sin lechuga', precio: 0 }, { nombre: 'Sin tomate', precio: 0 }, { nombre: 'Sin mayonesa', precio: 0 }, { nombre: 'Sin huevo', precio: 0 }, { nombre: 'Queso extra', precio: 1200 }, { nombre: 'Panceta', precio: 1500 }, { nombre: 'Huevo', precio: 900 } ] },
  { nombre: 'Lomito completo', categoria: 'comida', emoji: '🥙', precio: 13500, costo: 5400, stock: 12, stockMinimo: 4, orden: 21, ambito: 'mesa', estacion: 'cocina',
    opciones: [ { nombre: 'Sin lechuga', precio: 0 }, { nombre: 'Sin tomate', precio: 0 }, { nombre: 'Sin mayonesa', precio: 0 }, { nombre: 'Sin huevo', precio: 0 }, { nombre: 'Queso extra', precio: 1200 }, { nombre: 'Panceta', precio: 1500 }, { nombre: 'Huevo', precio: 900 } ] },
  { nombre: 'Lomito árabe', categoria: 'comida', emoji: '🥙', precio: 12000, costo: 4600, stock: 10, stockMinimo: 4, orden: 22, ambito: 'mesa', estacion: 'cocina',
    opciones: [ { nombre: 'Sin lechuga', precio: 0 }, { nombre: 'Sin tomate', precio: 0 }, { nombre: 'Sin mayonesa', precio: 0 }, { nombre: 'Sin huevo', precio: 0 }, { nombre: 'Queso extra', precio: 1200 }, { nombre: 'Panceta', precio: 1500 }, { nombre: 'Huevo', precio: 900 } ] },

  { nombre: 'Pizza muzzarella', categoria: 'comida', emoji: '🍕', precio: 12000, costo: 4000, stock: 12, stockMinimo: 3, orden: 30, ambito: 'mesa', estacion: 'cocina',
    opciones: [ { nombre: 'Sin aceitunas', precio: 0 }, { nombre: 'Sin orégano', precio: 0 }, { nombre: 'Sin cebolla', precio: 0 }, { nombre: 'Muzzarella extra', precio: 1800 }, { nombre: 'Jamón', precio: 1600 }, { nombre: 'Morrón', precio: 800 }, { nombre: 'Huevo', precio: 900 } ] },
  { nombre: 'Pizza napolitana', categoria: 'comida', emoji: '🍕', precio: 13500, costo: 4700, stock: 10, stockMinimo: 3, orden: 31, ambito: 'mesa', estacion: 'cocina',
    opciones: [ { nombre: 'Sin aceitunas', precio: 0 }, { nombre: 'Sin orégano', precio: 0 }, { nombre: 'Sin cebolla', precio: 0 }, { nombre: 'Muzzarella extra', precio: 1800 }, { nombre: 'Jamón', precio: 1600 }, { nombre: 'Morrón', precio: 800 }, { nombre: 'Huevo', precio: 900 } ] },
  { nombre: 'Pizza fugazzeta', categoria: 'comida', emoji: '🍕', precio: 13000, costo: 4400, stock: 10, stockMinimo: 3, orden: 32, ambito: 'mesa', estacion: 'cocina',
    opciones: [ { nombre: 'Sin aceitunas', precio: 0 }, { nombre: 'Sin orégano', precio: 0 }, { nombre: 'Sin cebolla', precio: 0 }, { nombre: 'Muzzarella extra', precio: 1800 }, { nombre: 'Jamón', precio: 1600 }, { nombre: 'Morrón', precio: 800 }, { nombre: 'Huevo', precio: 900 } ] },
  { nombre: 'Pizza especial', categoria: 'comida', emoji: '🍕', precio: 15000, costo: 5600, stock: 8, stockMinimo: 3, orden: 33, ambito: 'mesa', estacion: 'cocina',
    opciones: [ { nombre: 'Sin aceitunas', precio: 0 }, { nombre: 'Sin orégano', precio: 0 }, { nombre: 'Sin cebolla', precio: 0 }, { nombre: 'Muzzarella extra', precio: 1800 }, { nombre: 'Jamón', precio: 1600 }, { nombre: 'Morrón', precio: 800 }, { nombre: 'Huevo', precio: 900 } ] },

  { nombre: 'Papas fritas',      categoria: 'comida', emoji: '🍟', precio: 5500, costo: 1800, stock: 25, stockMinimo: 6, orden: 40, ambito: 'mesa', estacion: 'cocina',
    opciones: [ { nombre: 'Sin sal', precio: 0 }, { nombre: 'Con cheddar', precio: 1800 }, { nombre: 'Con panceta', precio: 1500 } ] },
  { nombre: 'Papas con cheddar', categoria: 'comida', emoji: '🍟', precio: 7300, costo: 2500, stock: 20, stockMinimo: 5, orden: 41, ambito: 'mesa', estacion: 'cocina',
    opciones: [ { nombre: 'Sin sal', precio: 0 }, { nombre: 'Con panceta', precio: 1500 } ] },

  /* Alquiler: solo tiene sentido en la cancha */
  { nombre: 'Alquiler de paleta',categoria: 'alquiler', emoji: '🎾', precio: 3000, costo: 0, stock: 8,  stockMinimo: 2, orden: 20, controlaStock: false, ambito: 'cancha' },
  { nombre: 'Tubo de pelotas',   categoria: 'alquiler', emoji: '🥎', precio: 6000, costo: 2600, stock: 15, stockMinimo: 4, orden: 21, ambito: 'cancha' }
];

/* Con ids explicitos hay que empujar la secuencia, si no el proximo insert choca. */
async function ajustarSecuencia(tabla) {
  try {
    await sequelize.query(
      `SELECT setval(pg_get_serial_sequence('${tabla}', 'id'), COALESCE((SELECT MAX(id) FROM ${tabla}), 1), true)`
    );
  } catch (err) {
    console.error(`Seed: no se pudo ajustar la secuencia de ${tabla}:`, err.message);
  }
}

async function seedEspacios() {
  const count = await Espacio.count();
  if (count > 0) { console.log(`Seed: espacios ya existen (${count})`); return; }
  await Espacio.bulkCreate(ESPACIOS_BASE);
  await ajustarSecuencia('espacios');
  console.log(`Seed: ${ESPACIOS_BASE.length} espacios creados (padel, tenis de mesa, pickleball, beach voley)`);
}

async function seedUsuarios() {
  const count = await Usuario.count();
  if (count > 0) { console.log(`Seed: usuarios ya existen (${count})`); return; }

  const pin = process.env.PIN_DUENO || '1234';
  await Usuario.create({
    nombre: process.env.NOMBRE_DUENO || 'Dueño',
    rol: 'dueno',
    color: '#f59e0b',
    pinHash: Usuario.hashPin(pin)
  });

  if (!process.env.PIN_DUENO) {
    console.warn('Seed: usuario dueño creado con PIN 1234. CAMBIALO desde el panel (Personal) o poné PIN_DUENO en las variables de entorno.');
  } else {
    console.log('Seed: usuario dueño creado con el PIN de PIN_DUENO');
  }
}

async function seedProductos() {
  const count = await Producto.count();
  if (count > 0) { console.log(`Seed: productos ya existen (${count})`); return; }
  await Producto.bulkCreate(PRODUCTOS_BASE);
  console.log(`Seed: ${PRODUCTOS_BASE.length} productos de buffet creados`);
}

const MESAS_BASE = [
  { nombre: 'Mesa 1', zona: 'Salón', capacidad: 4, orden: 1 },
  { nombre: 'Mesa 2', zona: 'Salón', capacidad: 4, orden: 2 },
  { nombre: 'Mesa 3', zona: 'Salón', capacidad: 6, orden: 3 },
  { nombre: 'Mesa 4', zona: 'Salón', capacidad: 2, orden: 4 },
  { nombre: 'Mesa 5', zona: 'Patio', capacidad: 6, orden: 5 },
  { nombre: 'Mesa 6', zona: 'Patio', capacidad: 4, orden: 6 },
  { nombre: 'Barra 1', zona: 'Barra', capacidad: 2, orden: 7 },
  { nombre: 'Barra 2', zona: 'Barra', capacidad: 2, orden: 8 }
];

async function seedMesas() {
  const count = await Mesa.count();
  if (count > 0) { console.log(`Seed: mesas ya existen (${count})`); return; }
  await Mesa.bulkCreate(MESAS_BASE);
  console.log(`Seed: ${MESAS_BASE.length} mesas creadas`);
}

module.exports = { seedEspacios, seedUsuarios, seedProductos, seedMesas, ESPACIOS_BASE, MESAS_BASE };
