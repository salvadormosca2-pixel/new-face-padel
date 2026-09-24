const express   = require('express');
const router    = express.Router();
const { Op }    = require('sequelize');
const Usuario   = require('../models/Usuario');
const Auditoria = require('../models/Auditoria');
const { ROLES, ACCIONES, permisosDe, autorizar, auditar, responderError, hoyStr } = require('../lib/permisos');

function publico(u) {
  return {
    id: u.id, nombre: u.nombre, rol: u.rol,
    rolNombre: ROLES[u.rol]?.nombre || u.rol,
    nivel: ROLES[u.rol]?.nivel || 0,
    activo: u.activo, color: u.color,
    ultimoAcceso: u.ultimoAcceso,
    permisos: permisosDe(u.rol),
    tienePin: !!u.pinHash
  };
}

/* ─── Catalogo de roles y acciones (lo usa el panel) ─── */

router.get('/api/admin/roles', (_req, res) => {
  res.json({
    roles: Object.entries(ROLES).map(([id, r]) => ({
      id, nombre: r.nombre, nivel: r.nivel, permisos: permisosDe(id)
    })),
    acciones: ACCIONES
  });
});

/* ─── Personal ─── */

router.get('/api/admin/usuarios', async (req, res) => {
  try {
    const where = req.query.todos === '1' ? {} : { activo: true };
    const list = await Usuario.findAll({ where, order: [['activo', 'DESC'], ['nombre', 'ASC']], raw: true });
    res.json(list.map(publico));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/*
  Verificacion suelta del PIN: la usa el panel para confirmar una accion que no
  toca el backend (abrir la caja, ver auditoria) y para validar antes de mostrar
  un error feo. No modifica nada.
*/
router.post('/api/admin/usuarios/verificar', async (req, res) => {
  try {
    const usuario = await autorizar(req, req.body.permiso || null);
    res.json({ ok: true, usuario: publico(usuario.toJSON()) });
  } catch (err) { responderError(res, err); }
});

router.post('/api/admin/usuarios', async (req, res) => {
  try {
    const autor = await autorizar(req, 'usuario.editar');
    const { nombre, rol, pin, color } = req.body;
    if (!nombre || !rol || !pin) return res.status(400).json({ error: 'nombre, rol y pin son obligatorios' });
    if (!ROLES[rol]) return res.status(400).json({ error: 'Rol invalido (jefe, dueno o empleado)' });
    if (!/^\d{4,8}$/.test(String(pin))) return res.status(400).json({ error: 'El PIN debe tener entre 4 y 8 numeros' });

    const nuevo = await Usuario.create({
      nombre, rol, color: color || '#64748b', pinHash: Usuario.hashPin(pin)
    });

    await auditar(autor, {
      accion: 'usuario.editar', entidad: 'usuario', entidadId: nuevo.id,
      descripcion: `Dio de alta a ${nombre} como ${ROLES[rol].nombre}`,
      detalle: { rol }
    });
    res.json(publico(nuevo.toJSON()));
  } catch (err) { responderError(res, err); }
});

router.patch('/api/admin/usuarios/:id', async (req, res) => {
  try {
    const autor = await autorizar(req, 'usuario.editar');
    const usuario = await Usuario.findByPk(parseInt(req.params.id));
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    const cambios = {};
    if (req.body.nombre) cambios.nombre = req.body.nombre;
    if (req.body.color)  cambios.color  = req.body.color;
    if (req.body.rol) {
      if (!ROLES[req.body.rol]) return res.status(400).json({ error: 'Rol invalido' });
      cambios.rol = req.body.rol;
    }
    if (req.body.activo !== undefined) cambios.activo = !!req.body.activo;
    if (req.body.nuevoPin) {
      if (!/^\d{4,8}$/.test(String(req.body.nuevoPin))) return res.status(400).json({ error: 'El PIN debe tener entre 4 y 8 numeros' });
      cambios.pinHash = Usuario.hashPin(req.body.nuevoPin);
    }

    /* El ultimo dueño activo no se puede degradar ni desactivar: quedaria el club sin llaves. */
    const bajaDeDueno = (cambios.activo === false || (cambios.rol && cambios.rol !== 'dueno'));
    if (usuario.rol === 'dueno' && bajaDeDueno) {
      const duenos = await Usuario.count({ where: { rol: 'dueno', activo: true, id: { [Op.ne]: usuario.id } } });
      if (duenos === 0) return res.status(400).json({ error: 'Tiene que quedar al menos un dueño activo' });
    }

    await usuario.update(cambios);
    await auditar(autor, {
      accion: 'usuario.editar', entidad: 'usuario', entidadId: usuario.id,
      descripcion: `Modificó a ${usuario.nombre}${cambios.pinHash ? ' (cambió el PIN)' : ''}`,
      detalle: { ...cambios, pinHash: cambios.pinHash ? '***' : undefined }
    });
    res.json(publico(usuario.toJSON()));
  } catch (err) { responderError(res, err); }
});

router.delete('/api/admin/usuarios/:id', async (req, res) => {
  try {
    const autor = await autorizar(req, 'usuario.editar');
    const usuario = await Usuario.findByPk(parseInt(req.params.id));
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (usuario.rol === 'dueno') {
      const duenos = await Usuario.count({ where: { rol: 'dueno', activo: true, id: { [Op.ne]: usuario.id } } });
      if (duenos === 0) return res.status(400).json({ error: 'Tiene que quedar al menos un dueño activo' });
    }
    await usuario.update({ activo: false });
    await auditar(autor, {
      accion: 'usuario.editar', entidad: 'usuario', entidadId: usuario.id,
      descripcion: `Dio de baja a ${usuario.nombre}`
    });
    res.json({ ok: true });
  } catch (err) { responderError(res, err); }
});

/* ─── Auditoria: quien hizo que ─── */

router.get('/api/admin/auditoria', async (req, res) => {
  try {
    const { desde, hasta, usuarioId, accion, entidad, entidadId } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 200, 1000);

    const where = {};
    if (desde && hasta) where.fecha = { [Op.gte]: desde, [Op.lte]: hasta };
    else if (desde)     where.fecha = { [Op.gte]: desde };
    if (usuarioId) where.usuarioId = parseInt(usuarioId);
    if (accion)    where.accion = accion;
    if (entidad)   where.entidad = entidad;
    if (entidadId) where.entidadId = String(entidadId);

    const registros = await Auditoria.findAll({ where, order: [['id', 'DESC']], limit, raw: true });
    res.json(registros.map(r => ({ ...r, accionNombre: ACCIONES[r.accion] || r.accion })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* Resumen por persona: cuantos turnos cargó, cuánto cobró, cuántas ventas hizo. */
router.get('/api/admin/auditoria/resumen', async (req, res) => {
  try {
    const desde = req.query.desde || hoyStr();
    const hasta = req.query.hasta || hoyStr();
    const registros = await Auditoria.findAll({
      where: { fecha: { [Op.gte]: desde, [Op.lte]: hasta } }, raw: true
    });

    const porUsuario = {};
    registros.forEach(r => {
      const k = r.usuarioId || `ext:${r.usuarioNombre}`;
      if (!porUsuario[k]) porUsuario[k] = {
        usuarioId: r.usuarioId, nombre: r.usuarioNombre, rol: r.usuarioRol,
        turnosCargados: 0, turnosLiberados: 0, cobros: 0, montoCobrado: 0,
        consumiciones: 0, faltas: 0, acciones: 0
      };
      const u = porUsuario[k];
      u.acciones++;
      if (r.accion === 'reserva.crear')      u.turnosCargados++;
      if (r.accion === 'reserva.liberar')    u.turnosLiberados++;
      if (r.accion === 'cobro.registrar')  { u.cobros++; u.montoCobrado += r.monto || 0; }
      if (r.accion === 'consumicion.crear')  u.consumiciones++;
      if (r.accion === 'reserva.asistencia' && r.detalle?.asistencia === 'falta') u.faltas++;
    });

    res.json({ desde, hasta, personas: Object.values(porUsuario).sort((a, b) => b.acciones - a.acciones) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
