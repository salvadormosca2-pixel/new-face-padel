const express     = require('express');
const router      = express.Router();
const { Op }      = require('sequelize');
const Producto    = require('../models/Producto');
const Consumicion = require('../models/Consumicion');
const Reserva     = require('../models/Reserva');
const { autorizar, auditar, responderError, hoyStr } = require('../lib/permisos');
const { cuentaDeReserva, recalcularEstadoPago } = require('../lib/cuentas');
const { precioLinea, productosDe, AMBITOS } = require('../lib/opciones');
const { crearComanda } = require('../lib/comandas');

const CATEGORIAS = {
  bebida:   { nombre: 'Bebidas',   emoji: '🥤' },
  comida:   { nombre: 'Comida',    emoji: '🍔' },
  alquiler: { nombre: 'Alquiler',  emoji: '🎾' },
  otro:     { nombre: 'Otros',     emoji: '📦' }
};

/* ─── Catalogo ─── */

router.get('/api/admin/productos', async (req, res) => {
  try {
    /* ?donde=mesa | cancha filtra la carta según dónde se está cobrando */
    const donde = ['mesa', 'cancha'].includes(req.query.donde) ? req.query.donde : null;
    const list = await productosDe(donde, { soloActivos: req.query.todos !== '1' });
    res.json(list.map(p => ({
      ...p,
      categoriaNombre: CATEGORIAS[p.categoria]?.nombre || p.categoria,
      stockBajo: p.controlaStock && p.stock <= p.stockMinimo,
      sinStock:  p.controlaStock && p.stock <= 0,
      opciones:  Array.isArray(p.opciones) ? p.opciones : [],
      estacion:  p.estacion || 'directo'
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/admin/productos/categorias', (_req, res) => {
  res.json(Object.entries(CATEGORIAS).map(([id, c]) => ({ id, ...c })));
});

router.post('/api/admin/productos', async (req, res) => {
  try {
    const usuario = await autorizar(req, 'producto.editar');
    const { nombre, categoria, precio, emoji, stock, stockMinimo, controlaStock, costo, orden, ambito, opciones, estacion, imagen, descripcion } = req.body;
    if (!nombre || precio === undefined) return res.status(400).json({ error: 'nombre y precio son obligatorios' });

    const p = await Producto.create({
      nombre,
      categoria: CATEGORIAS[categoria] ? categoria : 'otro',
      emoji: emoji || CATEGORIAS[categoria]?.emoji || '📦',
      precio: parseFloat(precio) || 0,
      costo: parseFloat(costo) || 0,
      controlaStock: controlaStock !== false,
      stock: parseInt(stock) || 0,
      stockMinimo: Number.isInteger(parseInt(stockMinimo)) ? parseInt(stockMinimo) : 5,
      orden: parseInt(orden) || 0,
      ambito: AMBITOS.includes(ambito) ? ambito : 'ambos',
      opciones: Array.isArray(opciones) ? opciones : [],
      estacion: ['cocina', 'barra', 'directo'].includes(estacion) ? estacion : 'directo',
      imagen: typeof imagen === 'string' ? imagen.slice(0, 400000) : '',
      descripcion: typeof descripcion === 'string' ? descripcion.slice(0, 600) : ''
    });

    await auditar(usuario, {
      accion: 'producto.editar', entidad: 'producto', entidadId: p.id,
      descripcion: `Creó el producto ${p.nombre} a $${p.precio}`, detalle: { precio: p.precio, stock: p.stock }
    });
    res.json(p);
  } catch (err) { responderError(res, err); }
});

router.patch('/api/admin/productos/:id', async (req, res) => {
  try {
    const usuario = await autorizar(req, 'producto.editar');
    const p = await Producto.findByPk(parseInt(req.params.id));
    if (!p) return res.status(404).json({ error: 'Producto no encontrado' });

    const cambios = {};
    ['nombre', 'emoji'].forEach(f => { if (req.body[f] !== undefined) cambios[f] = req.body[f]; });
    if (typeof req.body.imagen === 'string')      cambios.imagen = req.body.imagen.slice(0, 400000);
    if (typeof req.body.descripcion === 'string') cambios.descripcion = req.body.descripcion.slice(0, 600);
    ['precio', 'costo'].forEach(f => { if (req.body[f] !== undefined) cambios[f] = parseFloat(req.body[f]) || 0; });
    ['stock', 'stockMinimo', 'orden'].forEach(f => { if (req.body[f] !== undefined) cambios[f] = parseInt(req.body[f]) || 0; });
    if (req.body.categoria && CATEGORIAS[req.body.categoria]) cambios.categoria = req.body.categoria;
    if (req.body.controlaStock !== undefined) cambios.controlaStock = !!req.body.controlaStock;
    if (AMBITOS.includes(req.body.ambito)) cambios.ambito = req.body.ambito;
    if (Array.isArray(req.body.opciones)) cambios.opciones = req.body.opciones;
    if (['cocina', 'barra', 'directo'].includes(req.body.estacion)) cambios.estacion = req.body.estacion;
    if (req.body.activo !== undefined) cambios.activo = !!req.body.activo;

    const precioAnterior = p.precio;
    await p.update(cambios);
    await auditar(usuario, {
      accion: 'producto.editar', entidad: 'producto', entidadId: p.id,
      descripcion: cambios.precio !== undefined && cambios.precio !== precioAnterior
        ? `Cambió el precio de ${p.nombre}: $${precioAnterior} → $${cambios.precio}`
        : `Editó el producto ${p.nombre}`,
      detalle: cambios
    });
    res.json(p);
  } catch (err) { responderError(res, err); }
});

/* Reposicion de stock: "entraron 24 aguas". */
router.post('/api/admin/productos/:id/stock', async (req, res) => {
  try {
    const usuario = await autorizar(req, 'producto.editar');
    const p = await Producto.findByPk(parseInt(req.params.id));
    if (!p) return res.status(404).json({ error: 'Producto no encontrado' });

    const suma   = req.body.sumar !== undefined ? parseInt(req.body.sumar) : null;
    const fijar  = req.body.fijar !== undefined ? parseInt(req.body.fijar) : null;
    if (suma === null && fijar === null) return res.status(400).json({ error: 'Mandá sumar o fijar' });

    const anterior = p.stock;
    const nuevo = fijar !== null ? fijar : anterior + suma;
    await p.update({ stock: nuevo });

    await auditar(usuario, {
      accion: 'producto.editar', entidad: 'producto', entidadId: p.id,
      descripcion: `Stock de ${p.nombre}: ${anterior} → ${nuevo}`,
      detalle: { anterior, nuevo, motivo: req.body.motivo || 'reposición' }
    });
    res.json(p);
  } catch (err) { responderError(res, err); }
});

router.delete('/api/admin/productos/:id', async (req, res) => {
  try {
    const usuario = await autorizar(req, 'producto.editar');
    const p = await Producto.findByPk(parseInt(req.params.id));
    if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
    await p.update({ activo: false });
    await auditar(usuario, {
      accion: 'producto.editar', entidad: 'producto', entidadId: p.id,
      descripcion: `Dio de baja el producto ${p.nombre}`
    });
    res.json({ ok: true });
  } catch (err) { responderError(res, err); }
});

/* ─── Consumiciones de un turno ─── */

router.get('/api/admin/reserva/:id/consumiciones', async (req, res) => {
  try {
    const list = await Consumicion.findAll({
      where: { reservaId: parseInt(req.params.id), anulada: false },
      order: [['id', 'ASC']], raw: true
    });
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/*
  Cargar consumo a la cancha. Acepta un producto del catalogo (productoId) o una
  linea suelta (nombre + precioUnitario) para lo que no esté cargado todavia.
*/
router.post('/api/admin/reserva/:id/consumicion', async (req, res) => {
  try {
    const usuario = await autorizar(req, 'consumicion.crear');
    const reservaId = parseInt(req.params.id);
    const reserva = await Reserva.findByPk(reservaId);
    if (!reserva) return res.status(404).json({ error: 'Turno no encontrado' });

    const cantidad = Math.max(1, parseInt(req.body.cantidad) || 1);
    let nombre = req.body.nombre;
    let precioUnitario = parseFloat(req.body.precioUnitario);
    let emoji = req.body.emoji || '🥤';
    let producto = null;
    let alerta = null;

    if (req.body.productoId) {
      producto = await Producto.findByPk(parseInt(req.body.productoId));
      if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });
      nombre = producto.nombre;
      emoji = producto.emoji;
      if (isNaN(precioUnitario)) precioUnitario = producto.precio;
    }

    if (!nombre || isNaN(precioUnitario)) return res.status(400).json({ error: 'Falta el producto o el precio' });

    const total = Math.round(precioUnitario * cantidad * 100) / 100;

    const consumicion = await Consumicion.create({
      reservaId, productoId: producto?.id || null,
      nombre, emoji, cantidad, precioUnitario, total,
      fecha: reserva.fecha,
      usuarioId: usuario.id, usuarioNombre: usuario.nombre
    });

    /*
      El stock se descuenta siempre, aunque quede en negativo: en el mostrador no se
      frena una venta por un conteo desactualizado, pero el faltante queda a la vista.
    */
    if (producto && producto.controlaStock) {
      await producto.update({ stock: producto.stock - cantidad });
      if (producto.stock - cantidad < 0) alerta = `Stock de ${producto.nombre} quedó en ${producto.stock - cantidad}: hay que ajustarlo`;
      else if (producto.stock - cantidad <= producto.stockMinimo) alerta = `Quedan ${producto.stock - cantidad} de ${producto.nombre}`;
    }

    await recalcularEstadoPago(reservaId);
    await auditar(usuario, {
      accion: 'consumicion.crear', entidad: 'consumicion', entidadId: consumicion.id,
      descripcion: `Cargó ${cantidad}x ${nombre} a ${reserva.cliente_nombre} (${reserva.fecha} ${reserva.hora_inicio})`,
      monto: total, fecha: reserva.fecha,
      detalle: { reservaId, cantidad, nombre, precioUnitario }
    });

    res.json({ consumicion, alerta, cuenta: await cuentaDeReserva(reservaId) });
  } catch (err) { responderError(res, err); }
});

/*
  Pedido completo de una sola vez: "2 aguas y un sandwich a la 3".
  Va en lote para que el mostrador firme un PIN por pedido y no uno por producto.
*/
router.post('/api/admin/reserva/:id/consumiciones', async (req, res) => {
  try {
    const usuario = await autorizar(req, 'consumicion.crear');
    const reservaId = parseInt(req.params.id);
    const reserva = await Reserva.findByPk(reservaId);
    if (!reserva) return res.status(404).json({ error: 'Turno no encontrado' });

    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (items.length === 0) return res.status(400).json({ error: 'No mandaste ningún producto' });

    const creadas = [], alertas = [], usados = [];

    for (const item of items) {
      const cantidad = Math.max(1, parseInt(item.cantidad) || 1);
      let { nombre, precioUnitario, emoji } = item;
      let producto = null, opciones = [], detalle = '';

      if (item.productoId) {
        producto = await Producto.findByPk(parseInt(item.productoId));
        if (!producto) { alertas.push(`Producto ${item.productoId} inexistente, se salteó`); continue; }
        nombre = producto.nombre;
        emoji  = producto.emoji;
        const linea = precioLinea(producto, item.opciones, cantidad);
        opciones = linea.opciones; detalle = linea.detalle;
        precioUnitario = linea.precioUnitario;
        usados.push(producto.toJSON ? producto.toJSON() : producto);
      }
      precioUnitario = parseFloat(precioUnitario);
      if (!nombre || isNaN(precioUnitario)) { alertas.push('Una línea venía sin producto o sin precio, se salteó'); continue; }

      const total = Math.round(precioUnitario * cantidad * 100) / 100;
      creadas.push(await Consumicion.create({
        reservaId, productoId: producto?.id || null,
        nombre, emoji: emoji || '🥤', cantidad, precioUnitario, total,
        opciones, detalle,
        nota: (item.nota || '').trim().slice(0, 120),
        fecha: reserva.fecha, usuarioId: usuario.id, usuarioNombre: usuario.nombre
      }));

      if (producto && producto.controlaStock) {
        const restante = producto.stock - cantidad;
        await producto.update({ stock: restante });
        if (restante < 0) alertas.push(`Stock de ${producto.nombre} quedó en ${restante}: hay que ajustarlo`);
        else if (restante <= producto.stockMinimo) alertas.push(`Quedan ${restante} de ${producto.nombre}`);
      }
    }

    if (creadas.length === 0) return res.status(400).json({ error: 'No se pudo cargar ninguna línea', alertas });

    await recalcularEstadoPago(reservaId);

    const comanda = await crearComanda({
      consumiciones: creadas.map(c => c.toJSON()),
      productos: usados, reserva: reserva.toJSON(), usuario, nota: req.body.nota
    });

    const total = creadas.reduce((s, c) => s + c.total, 0);
    const detalleTxt = creadas.map(c => `${c.cantidad}x ${c.nombre}${c.detalle ? ' (' + c.detalle + ')' : ''}`).join(', ');

    await auditar(usuario, {
      accion: 'consumicion.crear', entidad: 'reserva', entidadId: reservaId,
      descripcion: `Cargó ${detalleTxt} a ${reserva.cliente_nombre} (${reserva.fecha} ${reserva.hora_inicio})`,
      monto: total, fecha: reserva.fecha,
      detalle: { reservaId, lineas: creadas.length, items: creadas.map(c => ({ nombre: c.nombre, cantidad: c.cantidad, total: c.total })) }
    });

    res.json({
      consumiciones: creadas, alertas,
      comanda: comanda ? { id: comanda.id, numero: comanda.numero, estacion: comanda.estacion } : null,
      cuenta: await cuentaDeReserva(reservaId)
    });
  } catch (err) { responderError(res, err); }
});

router.delete('/api/admin/consumicion/:id', async (req, res) => {
  try {
    const usuario = await autorizar(req, 'consumicion.anular');
    const c = await Consumicion.findByPk(parseInt(req.params.id));
    if (!c) return res.status(404).json({ error: 'Consumición no encontrada' });
    if (c.anulada) return res.status(400).json({ error: 'Ya estaba anulada' });

    await c.update({ anulada: true });
    if (c.productoId) {
      const p = await Producto.findByPk(c.productoId);
      if (p && p.controlaStock) await p.update({ stock: p.stock + c.cantidad });
    }
    await recalcularEstadoPago(c.reservaId);

    await auditar(usuario, {
      accion: 'consumicion.anular', entidad: 'consumicion', entidadId: c.id,
      descripcion: `Anuló ${c.cantidad}x ${c.nombre} ($${c.total}) — la había cargado ${c.usuarioNombre}`,
      monto: -c.total, fecha: c.fecha,
      detalle: { reservaId: c.reservaId, cargadaPor: c.usuarioNombre }
    });

    res.json({ ok: true, cuenta: await cuentaDeReserva(c.reservaId) });
  } catch (err) { responderError(res, err); }
});

/* ─── Ventas del buffet ─── */

router.get('/api/admin/buffet/ventas', async (req, res) => {
  try {
    const desde = req.query.desde || hoyStr();
    const hasta = req.query.hasta || hoyStr();

    const [lineas, anuladas, productos] = await Promise.all([
      Consumicion.findAll({ where: { fecha: { [Op.gte]: desde, [Op.lte]: hasta }, anulada: false }, raw: true }),
      Consumicion.findAll({ where: { fecha: { [Op.gte]: desde, [Op.lte]: hasta }, anulada: true }, raw: true }),
      Producto.findAll({ raw: true })
    ]);

    /*
      Unidad por unidad y peso por peso: cuántas gaseosas, cuántas papas, qué dejó
      cada una. Con el costo cargado sale también la ganancia real por producto.
    */
    const porProducto = {};
    lineas.forEach(l => {
      const k = l.productoId || l.nombre;
      if (!porProducto[k]) {
        const prod = productos.find(p => p.id === l.productoId);
        porProducto[k] = {
          productoId: l.productoId, nombre: l.nombre, emoji: l.emoji,
          categoria: prod?.categoria || 'otro',
          precio: prod?.precio ?? l.precioUnitario,
          costoUnitario: prod?.costo || 0,
          stock: prod?.controlaStock ? prod.stock : null,
          unidades: 0, total: 0, costo: 0, ganancia: 0, operaciones: 0
        };
      }
      const p = porProducto[k];
      p.unidades   += l.cantidad;
      p.total      += l.total;
      p.operaciones++;
      p.costo      += (p.costoUnitario || 0) * l.cantidad;
      p.ganancia    = Math.round((p.total - p.costo) * 100) / 100;
    });

    const porCategoria = {};
    Object.values(porProducto).forEach(p => {
      if (!porCategoria[p.categoria]) porCategoria[p.categoria] = {
        id: p.categoria, nombre: CATEGORIAS[p.categoria]?.nombre || p.categoria,
        unidades: 0, total: 0
      };
      porCategoria[p.categoria].unidades += p.unidades;
      porCategoria[p.categoria].total    += p.total;
    });

    /* Quién cargó cada consumición, y quién anuló: las anulaciones son la fuga clásica */
    const porUsuario = {};
    const sumarA = (mapa, nombre, campo, valor) => {
      if (!mapa[nombre]) mapa[nombre] = { nombre, lineas: 0, total: 0, anuladas: 0, montoAnulado: 0 };
      mapa[nombre][campo] += valor;
    };
    lineas.forEach(l => {
      const n = l.usuarioNombre || 'Sistema';
      sumarA(porUsuario, n, 'lineas', 1);
      sumarA(porUsuario, n, 'total', l.total);
    });
    anuladas.forEach(l => {
      const n = l.usuarioNombre || 'Sistema';
      sumarA(porUsuario, n, 'anuladas', 1);
      sumarA(porUsuario, n, 'montoAnulado', l.total);
    });

    const total    = Math.round(lineas.reduce((s, l) => s + l.total, 0) * 100) / 100;
    const costo    = Math.round(Object.values(porProducto).reduce((s, p) => s + p.costo, 0) * 100) / 100;
    const anulado  = Math.round(anuladas.reduce((s, l) => s + l.total, 0) * 100) / 100;

    res.json({
      desde, hasta,
      total, costo,
      ganancia: Math.round((total - costo) * 100) / 100,
      margen: total > 0 ? Math.round((total - costo) / total * 100) : 0,
      unidades: lineas.reduce((s, l) => s + l.cantidad, 0),
      anulado, anuladasCantidad: anuladas.length,
      porProducto:  Object.values(porProducto).sort((a, b) => b.total - a.total),
      porCategoria: Object.values(porCategoria).sort((a, b) => b.total - a.total),
      porUsuario:   Object.values(porUsuario).sort((a, b) => b.total - a.total),
      sinStock:  productos.filter(p => p.activo && p.controlaStock && p.stock <= 0).map(p => ({ id: p.id, nombre: p.nombre, stock: p.stock })),
      stockBajo: productos.filter(p => p.activo && p.controlaStock && p.stock > 0 && p.stock <= p.stockMinimo).map(p => ({ id: p.id, nombre: p.nombre, stock: p.stock, minimo: p.stockMinimo }))
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
